-- Migration 018: agent_feedback + win_streak (final - all CR/Devin issues fixed)
-- Fixes: score recomputed in recompute_memory_stats (Devin), cascade DELETE guard (CR),
--        REVOKE PUBLIC on SECURITY DEFINER functions (CR), ADD COLUMN IF NOT EXISTS
--        not DROP (CR), OLD memory_id recomputed on UPDATE (Devin), streak from history (CR).

CREATE TABLE IF NOT EXISTS public.agent_feedback (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id        UUID        NOT NULL REFERENCES public.agent_memory(id) ON DELETE CASCADE,
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
ALTER TABLE public.agent_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_feedback_service_all" ON public.agent_feedback;
CREATE POLICY "agent_feedback_service_all" ON public.agent_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMENT ON TABLE public.agent_feedback IS
  '👍 Agent Feedback | Human ratings 1-5. Drives win_streak+score on agent_memory via trigger.';

-- FIX (CR): ADD COLUMN IF NOT EXISTS — never DROP (destroys data on re-apply)
ALTER TABLE public.agent_memory
  ADD COLUMN IF NOT EXISTS win_streak    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_wins    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_losses  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_partial INTEGER NOT NULL DEFAULT 0;

-- recompute_memory_stats: full rebuild of ALL stats including score and streak
-- FIX (Devin): now recomputes score (was missing — caused drift on UPDATE/DELETE)
-- FIX (CR): win_streak rebuilt from ordered history after last incorrect (not just "any incorrect?")
CREATE OR REPLACE FUNCTION public.recompute_memory_stats(p_memory_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_correct        INTEGER := 0;
  v_incorrect      INTEGER := 0;
  v_partial        INTEGER := 0;
  v_score          FLOAT;
  v_streak         INTEGER := 0;
  v_last_incorrect TIMESTAMPTZ;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE feedback_type = 'correct'),
    COUNT(*) FILTER (WHERE feedback_type = 'incorrect'),
    COUNT(*) FILTER (WHERE feedback_type = 'partial'),
    MAX(created_at) FILTER (WHERE feedback_type = 'incorrect')
  INTO v_correct, v_incorrect, v_partial, v_last_incorrect
  FROM public.agent_feedback WHERE memory_id = p_memory_id;

  v_score := LEAST(1.0, GREATEST(0.0,
    0.5 + (COALESCE(v_correct,0)*0.05) - (COALESCE(v_incorrect,0)*0.10) + (COALESCE(v_partial,0)*0.02)
  ));

  -- Streak = consecutive 'correct' rows AFTER last 'incorrect' (partial is neutral)
  SELECT COUNT(*) INTO v_streak
  FROM public.agent_feedback
  WHERE memory_id = p_memory_id
    AND feedback_type = 'correct'
    AND (v_last_incorrect IS NULL OR created_at > v_last_incorrect);

  UPDATE public.agent_memory SET
    total_wins = COALESCE(v_correct,0), total_losses = COALESCE(v_incorrect,0),
    total_partial = COALESCE(v_partial,0), win_streak = v_streak, score = v_score
  WHERE id = p_memory_id;
END;
$$;
-- FIX (CR): SECURITY DEFINER functions must not be callable by PUBLIC
REVOKE EXECUTE ON FUNCTION public.recompute_memory_stats(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recompute_memory_stats(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.update_win_streak()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _mem RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO _mem FROM public.agent_memory WHERE id = NEW.memory_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'agent_memory row % not found on INSERT', NEW.memory_id;
    END IF;
    IF NEW.feedback_type = 'correct' THEN
      UPDATE public.agent_memory SET win_streak=win_streak+1, total_wins=total_wins+1,
        score=LEAST(1.0,COALESCE(score,0.5)+0.05) WHERE id=NEW.memory_id;
    ELSIF NEW.feedback_type = 'incorrect' THEN
      UPDATE public.agent_memory SET win_streak=0, total_losses=total_losses+1,
        score=GREATEST(0.0,COALESCE(score,0.5)-0.10) WHERE id=NEW.memory_id;
    ELSIF NEW.feedback_type = 'partial' THEN
      UPDATE public.agent_memory SET total_partial=total_partial+1,
        score=LEAST(1.0,COALESCE(score,0.5)+0.02) WHERE id=NEW.memory_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    SELECT * INTO _mem FROM public.agent_memory WHERE id=NEW.memory_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'agent_memory row % not found on UPDATE', NEW.memory_id;
    END IF;
    PERFORM public.recompute_memory_stats(NEW.memory_id);
    -- FIX (Devin): if memory_id changed, recompute OLD memory too
    IF OLD.memory_id IS DISTINCT FROM NEW.memory_id THEN
      SELECT * INTO _mem FROM public.agent_memory WHERE id=OLD.memory_id FOR UPDATE;
      IF FOUND THEN PERFORM public.recompute_memory_stats(OLD.memory_id); END IF;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- FIX (CR): cascade delete fires when parent already gone — guard it
    SELECT * INTO _mem FROM public.agent_memory WHERE id=OLD.memory_id FOR UPDATE;
    IF FOUND THEN PERFORM public.recompute_memory_stats(OLD.memory_id); END IF;
    RETURN OLD;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.update_win_streak() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_win_streak() TO service_role;

DROP TRIGGER IF EXISTS agent_memory_win_streak ON public.agent_feedback;
CREATE TRIGGER agent_memory_win_streak
  AFTER INSERT OR UPDATE OR DELETE ON public.agent_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_win_streak();

CREATE OR REPLACE FUNCTION public.get_memory_stats(p_memory_id UUID)
RETURNS TABLE(memory_id UUID, win_rate FLOAT, total_feedback INTEGER,
              current_streak INTEGER, current_score FLOAT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT am.id,
    CASE WHEN (am.total_wins+am.total_losses+am.total_partial)=0 THEN 0.0
         ELSE am.total_wins::FLOAT/(am.total_wins+am.total_losses+am.total_partial) END,
    (am.total_wins+am.total_losses+am.total_partial),
    am.win_streak, COALESCE(am.score,0.5)
  FROM public.agent_memory am WHERE am.id=p_memory_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_memory_stats(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_memory_stats(UUID) TO service_role;
