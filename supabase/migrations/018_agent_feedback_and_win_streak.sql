-- Migration 018: agent_feedback table + update_win_streak trigger
-- Applied via Supabase MCP to project lhhrcqywowyswfrtjowj on 2026-03-25
-- Updated: 2026-03-26 - Added idempotency, total_partial column, UPDATE/DELETE handling

CREATE TABLE IF NOT EXISTS public.agent_feedback (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id        UUID        REFERENCES public.agent_memory(id) ON DELETE CASCADE,
  feedback_type    TEXT        NOT NULL CHECK (feedback_type IN ('correct','incorrect','partial')),
  human_rating     INTEGER     CHECK (human_rating BETWEEN 1 AND 5),
  corrected_answer TEXT,
  reviewer_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  pr_number        INTEGER,
  model_used       TEXT,
  semantic_sim     FLOAT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_feedback_memory_id ON public.agent_feedback(memory_id);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_type      ON public.agent_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_reviewer  ON public.agent_feedback(reviewer_id);

-- Add NOT NULL constraint to memory_id to ensure referential integrity
ALTER TABLE public.agent_feedback ALTER COLUMN memory_id SET NOT NULL;
ALTER TABLE public.agent_feedback ENABLE ROW LEVEL SECURITY;

-- FIX: Make policy creation idempotent
DROP POLICY IF EXISTS "agent_feedback_service_all" ON public.agent_feedback;
CREATE POLICY "agent_feedback_service_all" ON public.agent_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- FIX: Add total_partial column to track partial feedback separately
-- This prevents inflating total_wins with partial results
ALTER TABLE public.agent_memory
  DROP COLUMN IF EXISTS total_partial,
  ADD COLUMN total_partial INTEGER NOT NULL DEFAULT 0;

-- Ensure other columns exist
ALTER TABLE public.agent_memory
  ADD COLUMN IF NOT EXISTS win_streak   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_wins   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_losses INTEGER NOT NULL DEFAULT 0;

-- Helper function to recompute aggregate stats for a memory_id
-- Used when feedback is updated or deleted to prevent stale counters
CREATE OR REPLACE FUNCTION public.recompute_memory_stats(p_memory_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_correct   INTEGER;
  v_incorrect INTEGER;
  v_partial   INTEGER;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE feedback_type = 'correct'),
    COUNT(*) FILTER (WHERE feedback_type = 'incorrect'),
    COUNT(*) FILTER (WHERE feedback_type = 'partial')
  INTO v_correct, v_incorrect, v_partial
  FROM public.agent_feedback
  WHERE memory_id = p_memory_id;

  UPDATE public.agent_memory
  SET total_wins = COALESCE(v_correct, 0),
      total_losses = COALESCE(v_incorrect, 0),
      total_partial = COALESCE(v_partial, 0),
      -- Reset streak to 0 if any incorrect feedback exists
      win_streak = CASE WHEN v_incorrect > 0 THEN 0 ELSE win_streak END
  WHERE id = p_memory_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_win_streak()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _mem RECORD;
BEGIN
  -- Lock the parent row to prevent race conditions
  SELECT * INTO _mem FROM public.agent_memory WHERE id =
    COALESCE(NEW.memory_id, OLD.memory_id) FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'agent_memory row with id % not found',
      COALESCE(NEW.memory_id, OLD.memory_id);
  END IF;

  -- Handle INSERT
  IF TG_OP = 'INSERT' THEN
    IF NEW.feedback_type = 'correct' THEN
      UPDATE public.agent_memory
      SET win_streak=win_streak+1, total_wins=total_wins+1,
          score=LEAST(1.0, COALESCE(score,0.5)+0.05)
      WHERE id = NEW.memory_id;
    ELSIF NEW.feedback_type = 'incorrect' THEN
      UPDATE public.agent_memory
      SET win_streak=0, total_losses=total_losses+1,
          score=GREATEST(0.0, COALESCE(score,0.5)-0.10)
      WHERE id = NEW.memory_id;
    ELSIF NEW.feedback_type = 'partial' THEN
      -- FIX: 'partial' counts toward total_partial, NOT total_wins
      -- Partial results contribute to feedback stats but don't build/break streaks
      UPDATE public.agent_memory
      SET total_partial=total_partial+1,
          score=LEAST(1.0, COALESCE(score,0.5)+0.02)
      WHERE id = NEW.memory_id;
    END IF;
    RETURN NEW;

  -- Handle UPDATE (feedback type changed)
  ELSIF TG_OP = 'UPDATE' THEN
    -- Recompute all stats from scratch to ensure consistency
    PERFORM public.recompute_memory_stats(NEW.memory_id);
    RETURN NEW;

  -- Handle DELETE
  ELSIF TG_OP = 'DELETE' THEN
    -- Recompute stats after deletion to prevent stale counters
    PERFORM public.recompute_memory_stats(OLD.memory_id);
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- FIX: Make trigger creation idempotent
DROP TRIGGER IF EXISTS agent_memory_win_streak ON public.agent_feedback;
CREATE TRIGGER agent_memory_win_streak
  AFTER INSERT OR UPDATE OR DELETE ON public.agent_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_win_streak();

-- RPC for querying memory statistics
CREATE OR REPLACE FUNCTION public.get_memory_stats(p_memory_id UUID)
RETURNS TABLE(
  memory_id UUID,
  win_rate FLOAT,
  total_feedback INTEGER,
  current_streak INTEGER
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT
    am.id,
    CASE
      WHEN (am.total_wins + am.total_losses + am.total_partial) = 0 THEN 0
      ELSE am.total_wins::FLOAT / (am.total_wins + am.total_losses + am.total_partial)
    END as win_rate,
    (am.total_wins + am.total_losses + am.total_partial) as total_feedback,
    am.win_streak as current_streak
  FROM public.agent_memory am
  WHERE am.id = p_memory_id;
END;
$$;
