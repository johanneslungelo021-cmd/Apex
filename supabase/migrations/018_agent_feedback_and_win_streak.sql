-- Migration 018: agent_feedback table + update_win_streak trigger
-- Applied via Supabase MCP to project lhhrcqywowyswfrtjowj on 2026-03-25

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
CREATE POLICY "agent_feedback_service_all" ON public.agent_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.agent_memory
  ADD COLUMN IF NOT EXISTS win_streak   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_wins   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_losses INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.update_win_streak()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _mem RECORD;
BEGIN
  -- Lock the parent row to prevent race conditions
  SELECT * INTO _mem FROM public.agent_memory WHERE id = NEW.memory_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agent_memory row with id % not found', NEW.memory_id;
  END IF;

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
    UPDATE public.agent_memory
    SET total_wins=total_wins+1,
        score=LEAST(1.0, COALESCE(score,0.5)+0.02)
    WHERE id = NEW.memory_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_memory_win_streak
  AFTER INSERT ON public.agent_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_win_streak();
