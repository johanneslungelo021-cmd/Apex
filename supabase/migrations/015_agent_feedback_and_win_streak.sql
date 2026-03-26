-- Migration 015: Agent Feedback Table and Win Streak Statistics
-- Fixes: Missing method column, deadlocks, full table scans, and security
-- PRs: #58 and #59 - Consolidated database fix

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
-- 3. The Deadlock-Safe Recompute Function
-- ═══════════════════════════════════════════════════════════════════════════
-- Handles concurrent updates safely with row-level locking
-- Prevents stale stats on OLD memory_id when UPDATE changes the reference
CREATE OR REPLACE FUNCTION public.recompute_memory_stats()
RETURNS TRIGGER
SECURITY DEFINER
AS $$
DECLARE
    _mem_id UUID;
BEGIN
    -- A. Handle UPDATE where memory_id changes (prevents stale stats on OLD memory)
    IF TG_OP = 'UPDATE' AND OLD.memory_id IS DISTINCT FROM NEW.memory_id THEN
        -- Lock and update the OLD memory row
        PERFORM id FROM public.agent_memory WHERE id = OLD.memory_id FOR UPDATE;
        UPDATE public.agent_memory
        SET total_wins = (SELECT COUNT(*) FROM public.agent_feedback WHERE memory_id = OLD.memory_id AND outcome = 'win'),
            total_losses = (SELECT COUNT(*) FROM public.agent_feedback WHERE memory_id = OLD.memory_id AND outcome = 'loss'),
            total_partial = (SELECT COUNT(*) FROM public.agent_feedback WHERE memory_id = OLD.memory_id AND outcome = 'partial')
        WHERE id = OLD.memory_id;
    END IF;

    -- B. Handle INSERT, DELETE, and the NEW memory_id for UPDATE
    _mem_id := COALESCE(NEW.memory_id, OLD.memory_id);
    IF _mem_id IS NOT NULL THEN
        -- Lock and update the active memory row
        PERFORM id FROM public.agent_memory WHERE id = _mem_id FOR UPDATE;
        UPDATE public.agent_memory
        SET total_wins = (SELECT COUNT(*) FROM public.agent_feedback WHERE memory_id = _mem_id AND outcome = 'win'),
            total_losses = (SELECT COUNT(*) FROM public.agent_feedback WHERE memory_id = _mem_id AND outcome = 'loss'),
            total_partial = (SELECT COUNT(*) FROM public.agent_feedback WHERE memory_id = _mem_id AND outcome = 'partial')
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
    'Trigger function that safely updates win/loss/partial counts on agent_memory. Uses row-level locking to prevent deadlocks. Handles memory_id changes in UPDATE operations to avoid stale statistics.';

COMMENT ON COLUMN public.ai_traces.method IS
    'HTTP method used for the AI request (GET, POST, etc.) - added for n8n Trace Logger compatibility.';
