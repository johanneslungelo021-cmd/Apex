-- Migration 015: Agent Feedback Table and Win Streak Statistics
-- Fixes: Missing method column, deadlocks, full table scans, and security
-- PRs: #58 and #59 - Consolidated database fix
-- Version: 2.0 - With deterministic lock ordering and score calculation

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Add missing column for n8n Trace Logger
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.ai_traces ADD COLUMN IF NOT EXISTS method text;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Create the Feedback Table (links traces to memory for outcome tracking)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.agent_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID NOT NULL REFERENCES public.agent_memory(id) ON DELETE CASCADE,
    trace_id UUID REFERENCES public.ai_traces(id),
    outcome text CHECK (outcome IN ('win', 'loss', 'partial')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns for win/loss tracking on agent_memory
ALTER TABLE public.agent_memory ADD COLUMN IF NOT EXISTS total_wins INTEGER DEFAULT 0;
ALTER TABLE public.agent_memory ADD COLUMN IF NOT EXISTS total_losses INTEGER DEFAULT 0;
ALTER TABLE public.agent_memory ADD COLUMN IF NOT EXISTS total_partial INTEGER DEFAULT 0;

-- Indexes for efficient feedback queries
CREATE INDEX IF NOT EXISTS idx_agent_feedback_memory_id ON public.agent_feedback(memory_id);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_trace_id ON public.agent_feedback(trace_id);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_outcome ON public.agent_feedback(outcome);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. The Deadlock-Safe Recompute Function (v2.0)
-- ═══════════════════════════════════════════════════════════════════════════
-- Key improvements:
-- - Deterministic lock ordering (smaller UUID first) to prevent deadlocks
-- - Score recalculation with clamping to [0.0, 1.0] boundary
-- - Handles UPDATE where memory_id changes
CREATE OR REPLACE FUNCTION public.recompute_memory_stats()
RETURNS TRIGGER
SECURITY DEFINER
AS $$
DECLARE
    _mem_id UUID;
    _old_mem_id UUID;
    _new_mem_id UUID;
    _wins INTEGER;
    _losses INTEGER;
    _partial INTEGER;
    _score FLOAT;
BEGIN
    -- ── Step 1: Determine which memory IDs need updating ─────────────────────
    _old_mem_id := OLD.memory_id;
    _new_mem_id := COALESCE(NEW.memory_id, NULL);

    -- ── Step 2: Handle UPDATE where memory_id changes ───────────────────────
    -- Use DETERMINISTIC LOCK ORDERING to prevent deadlocks
    -- Always lock the smaller UUID first
    IF TG_OP = 'UPDATE' AND _old_mem_id IS DISTINCT FROM _new_mem_id THEN
        IF _old_mem_id < _new_mem_id THEN
            -- Lock OLD first, then NEW (if NEW exists)
            PERFORM id FROM public.agent_memory WHERE id = _old_mem_id FOR UPDATE;
            IF _new_mem_id IS NOT NULL THEN
                PERFORM id FROM public.agent_memory WHERE id = _new_mem_id FOR UPDATE;
            END IF;
        ELSE
            -- Lock NEW first, then OLD
            IF _new_mem_id IS NOT NULL THEN
                PERFORM id FROM public.agent_memory WHERE id = _new_mem_id FOR UPDATE;
            END IF;
            PERFORM id FROM public.agent_memory WHERE id = _old_mem_id FOR UPDATE;
        END IF;

        -- Update OLD memory stats and score
        SELECT
            COUNT(*) FILTER (WHERE outcome = 'win'),
            COUNT(*) FILTER (WHERE outcome = 'loss'),
            COUNT(*) FILTER (WHERE outcome = 'partial')
        INTO _wins, _losses, _partial
        FROM public.agent_feedback WHERE memory_id = _old_mem_id;

        -- Calculate score: 0.5 baseline + wins bonus - losses penalty + partial small bonus
        _score := LEAST(1.0, GREATEST(0.0,
            0.5 + (COALESCE(_wins, 0) * 0.05) - (COALESCE(_losses, 0) * 0.10) + (COALESCE(_partial, 0) * 0.02)
        ));

        UPDATE public.agent_memory
        SET total_wins = COALESCE(_wins, 0),
            total_losses = COALESCE(_losses, 0),
            total_partial = COALESCE(_partial, 0),
            score = _score
        WHERE id = _old_mem_id;

        -- Continue to update NEW memory below
        _mem_id := _new_mem_id;
    ELSE
        -- INSERT or DELETE: only one memory to update
        _mem_id := COALESCE(NEW.memory_id, OLD.memory_id);
    END IF;

    -- ── Step 3: Update the primary memory row ───────────────────────────────
    IF _mem_id IS NOT NULL THEN
        -- Lock the memory row
        PERFORM id FROM public.agent_memory WHERE id = _mem_id FOR UPDATE;

        -- Get counts with single query
        SELECT
            COUNT(*) FILTER (WHERE outcome = 'win'),
            COUNT(*) FILTER (WHERE outcome = 'loss'),
            COUNT(*) FILTER (WHERE outcome = 'partial')
        INTO _wins, _losses, _partial
        FROM public.agent_feedback WHERE memory_id = _mem_id;

        -- Calculate score with clamping
        -- Formula: 0.5 baseline + 0.05 per win - 0.10 per loss + 0.02 per partial
        -- Clamped to [0.0, 1.0]
        _score := LEAST(1.0, GREATEST(0.0,
            0.5 + (COALESCE(_wins, 0) * 0.05) - (COALESCE(_losses, 0) * 0.10) + (COALESCE(_partial, 0) * 0.02)
        ));

        UPDATE public.agent_memory
        SET total_wins = COALESCE(_wins, 0),
            total_losses = COALESCE(_losses, 0),
            total_partial = COALESCE(_partial, 0),
            score = _score
        WHERE id = _mem_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Secure the function - revoke from PUBLIC to prevent privilege escalation
-- ═══════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.recompute_memory_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_memory_stats() TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Attach the Trigger
-- ═══════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trigger_recompute_memory_stats ON public.agent_feedback;
CREATE TRIGGER trigger_recompute_memory_stats
AFTER INSERT OR UPDATE OR DELETE ON public.agent_feedback
FOR EACH ROW EXECUTE FUNCTION public.recompute_memory_stats();

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. RLS Policies for agent_feedback
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.agent_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_feedback_service" ON public.agent_feedback
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Grant permissions
-- ═══════════════════════════════════════════════════════════════════════════
GRANT ALL ON TABLE public.agent_feedback TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Documentation comments
-- ═══════════════════════════════════════════════════════════════════════════
COMMENT ON TABLE public.agent_feedback IS
    'Links AI execution traces to memory entries with outcome tracking (win/loss/partial) for reinforcement learning.';

COMMENT ON FUNCTION public.recompute_memory_stats() IS
    'Deadlock-safe trigger function that updates win/loss/partial counts and calculates score on agent_memory.

Key features:
- Deterministic lock ordering (smaller UUID first) prevents deadlocks in concurrent updates
- Score formula: 0.5 + (wins * 0.05) - (losses * 0.10) + (partial * 0.02)
- Score clamped to [0.0, 1.0] boundary
- Handles memory_id changes in UPDATE operations';

COMMENT ON COLUMN public.ai_traces.method IS
    'HTTP method used for the AI request (GET, POST, etc.) - added for n8n Trace Logger compatibility.';
