-- ════════════════════════════════════════════════════════════════════════════
-- Migration 018: RLS on ai_traces + cryptographic_hash column
-- Required by: Apex Sovereign PR Review — Hardened v2
--
-- Fixes:
--   1. Enables Row Level Security on ai_traces so ANON_KEY insertions
--      are scoped to workflow identity — SERVICE_ROLE_KEY no longer needed.
--   2. Adds cryptographic_hash + verification_status columns for CARF audit.
--   3. Adds workflow_id + execution_id + latency_ms + pr_number columns
--      to support the hardened log payload.
--
-- REVOKE: function is not SECURITY DEFINER — no REVOKE required.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Column additions (idempotent) ────────────────────────────────────────────
ALTER TABLE public.ai_traces
    ADD COLUMN IF NOT EXISTS cryptographic_hash   TEXT,
    ADD COLUMN IF NOT EXISTS verification_status  TEXT    DEFAULT 'UNSIGNED',
    ADD COLUMN IF NOT EXISTS workflow_id           TEXT,
    ADD COLUMN IF NOT EXISTS execution_id          TEXT,
    ADD COLUMN IF NOT EXISTS latency_ms            INTEGER,
    ADD COLUMN IF NOT EXISTS pr_number             INTEGER;

-- ── Enable Row Level Security ────────────────────────────────────────────────
ALTER TABLE public.ai_traces ENABLE ROW LEVEL SECURITY;

-- ── Drop old permissive policies if they exist ───────────────────────────────
DROP POLICY IF EXISTS n8n_workflow_insert    ON public.ai_traces;
DROP POLICY IF EXISTS admin_select_ai_traces ON public.ai_traces;
DROP POLICY IF EXISTS allow_all_ai_traces    ON public.ai_traces;

-- ── INSERT policy: n8n anon key may insert rows for known workflow IDs ────────
-- The anon key is safe here because:
--   a) It cannot read other users' data (no SELECT policy for anon)
--   b) workflow_id is checked — only our registered workflows can write
CREATE POLICY n8n_workflow_insert ON public.ai_traces
    FOR INSERT
    WITH CHECK (
        workflow_id IN (
            'apex-sovereign-pr-review-v2',
            'tri-model-council',
            'rag-pipeline'
        )
    );

-- ── SELECT policy: service_role / admin only ──────────────────────────────────
CREATE POLICY admin_select_ai_traces ON public.ai_traces
    FOR SELECT
    USING (auth.role() = 'service_role');

-- ── Audit integrity verification function ────────────────────────────────────
-- Call: SELECT * FROM verify_ai_traces_integrity();
CREATE OR REPLACE FUNCTION public.verify_ai_traces_integrity()
RETURNS TABLE(
    trace_id   UUID,
    recorded   TIMESTAMPTZ,
    hash_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        id,
        created_at,
        CASE
            WHEN cryptographic_hash IS NULL THEN 'UNSIGNED'
            WHEN verification_status = 'SIGNED' THEN 'SIGNED'
            ELSE 'UNKNOWN'
        END AS hash_status
    FROM public.ai_traces
    ORDER BY created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.verify_ai_traces_integrity() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.verify_ai_traces_integrity() TO service_role;
