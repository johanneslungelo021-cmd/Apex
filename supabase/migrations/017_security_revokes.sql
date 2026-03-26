-- ══════════════════════════════════════════════════════════════════════
-- Migration 017: Security hardening - Revoke public access from SECURITY DEFINER functions
-- ══════════════════════════════════════════════════════════════════════

-- 1. WebAuthn & Creator Schema (Originally from 002)
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_treasury_split() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_treasury_split_on_update() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.register_webauthn_credential(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT[], TEXT, BOOLEAN, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_webauthn_credential(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT[], TEXT, BOOLEAN, TIMESTAMPTZ, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.purge_expired_webauthn_challenges() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_webauthn_challenges() TO service_role;

-- 2. Transaction Serializable (Originally from 006)
REVOKE ALL ON FUNCTION public.insert_transaction_serializable(UUID, UUID, NUMERIC(38,8), NUMERIC(38,8), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_transaction_serializable(UUID, UUID, NUMERIC(38,8), NUMERIC(38,8), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- 3. Emotion Cache (Originally from 007)
REVOKE ALL ON FUNCTION public.upsert_emotion_cache(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_emotion_cache(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.protect_signed_disbursement() FROM PUBLIC;

-- 4. RAG Pipeline Memory Retrieval (Originally from 014)
REVOKE ALL ON FUNCTION public.get_similar_memories(vector(768), INT, FLOAT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_similar_memories(vector(768), INT, FLOAT) TO service_role;

-- 5. RPC Aggregation Functions (Originally from 016)
REVOKE ALL ON FUNCTION public.get_treasury_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_treasury_summary() TO service_role;

REVOKE ALL ON FUNCTION public.get_creator_analytics(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_creator_analytics(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.get_recent_transactions(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recent_transactions(UUID, INT) TO service_role;

REVOKE ALL ON FUNCTION public.get_treasury_pool_entries(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_treasury_pool_entries(INT) TO service_role;

REVOKE ALL ON FUNCTION public.get_recent_disbursements(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recent_disbursements(INT) TO service_role;

REVOKE ALL ON FUNCTION public.get_active_proposals(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_proposals(INT) TO service_role;
