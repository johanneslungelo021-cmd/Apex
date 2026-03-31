-- Migration 016: Server-side RPC aggregation for treasury and analytics
-- Fixes client-side truncation issues where limit() caps caused partial summaries

-- ─────────────────────────────────────────────────────────────────────────────
-- Treasury Summary RPC — accurate totals without row limit truncation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_treasury_summary()
RETURNS TABLE(
    total_pool_zar     NUMERIC,
    approved_zar       NUMERIC,
    disbursed_zar      NUMERIC,
    pool_entry_count   BIGINT,
    disbursement_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT 
        COALESCE((SELECT SUM(amount_zar) FROM public.vaal_development_pool), 0) as total_pool_zar,
        COALESCE((SELECT SUM(amount_zar) FROM public.disbursement_log WHERE status = 'approved'), 0) as approved_zar,
        COALESCE((SELECT SUM(amount_zar) FROM public.disbursement_log WHERE status = 'paid'), 0) as disbursed_zar,
        (SELECT COUNT(*) FROM public.vaal_development_pool) as pool_entry_count,
        (SELECT COUNT(*) FROM public.disbursement_log) as disbursement_count;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Creator Analytics RPC — aggregated metrics without client-side processing
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_creator_analytics(p_creator_id UUID)
RETURNS TABLE(
    total_revenue_zar    NUMERIC,
    total_fees_zar       NUMERIC,
    creator_payout_zar   NUMERIC,
    transaction_count    BIGINT,
    active_subscribers   BIGINT,
    emotion_breakdown    JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT 
        COALESCE((
            SELECT SUM(amount_zar) 
            FROM public.transactions 
            WHERE creator_id = p_creator_id AND status = 'success'
        ), 0) as total_revenue_zar,
        COALESCE((
            SELECT SUM(platform_fee_zar) 
            FROM public.transactions 
            WHERE creator_id = p_creator_id AND status = 'success'
        ), 0) as total_fees_zar,
        COALESCE((
            SELECT SUM(amount_zar) - COALESCE(SUM(platform_fee_zar), 0)
            FROM public.transactions 
            WHERE creator_id = p_creator_id AND status = 'success'
        ), 0) as creator_payout_zar,
        (
            SELECT COUNT(*) 
            FROM public.transactions 
            WHERE creator_id = p_creator_id AND status = 'success'
        ) as transaction_count,
        (
            SELECT COUNT(*) 
            FROM public.subscriptions 
            WHERE creator_id = p_creator_id AND status = 'active'
        ) as active_subscribers,
        (
            SELECT COALESCE(jsonb_object_agg(emotion_state, cnt), '{}'::jsonb)
            FROM (
                SELECT emotion_state, COUNT(*) as cnt
                FROM public.transactions
                WHERE creator_id = p_creator_id AND status = 'success'
                GROUP BY emotion_state
            ) sub
        ) as emotion_breakdown;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Recent Transactions RPC — paginated recent transactions for analytics
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_recent_transactions(
    p_creator_id UUID,
    p_limit INT DEFAULT 5
)
RETURNS TABLE(
    id               UUID,
    amount_zar       NUMERIC,
    platform_fee_zar NUMERIC,
    emotion_state    TEXT,
    created_at       TIMESTAMPTZ,
    gateway          TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT id, amount_zar, platform_fee_zar, emotion_state, created_at, gateway
    FROM public.transactions
    WHERE creator_id = p_creator_id AND status = 'success'
    ORDER BY created_at DESC
    LIMIT p_limit;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Treasury Pool Entries RPC — paginated pool entries with totals
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_treasury_pool_entries(p_limit INT DEFAULT 100)
RETURNS TABLE(
    id             UUID,
    transaction_id TEXT,
    amount_zar     NUMERIC,
    split_pct      NUMERIC,
    created_at     TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT id, transaction_id, amount_zar, split_pct, created_at
    FROM public.vaal_development_pool
    ORDER BY created_at DESC
    LIMIT p_limit;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Recent Disbursements RPC — paginated disbursement log
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_recent_disbursements(p_limit INT DEFAULT 20)
RETURNS TABLE(
    amount_zar   NUMERIC,
    status       TEXT,
    paid_at      TIMESTAMPTZ,
    proposal_id  UUID,
    created_at   TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT amount_zar, status, paid_at, proposal_id, created_at
    FROM public.disbursement_log
    ORDER BY created_at DESC
    LIMIT p_limit;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Active Proposals RPC — governance proposals for treasury view
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_active_proposals(p_limit INT DEFAULT 10)
RETURNS TABLE(
    id               UUID,
    title            TEXT,
    status           TEXT,
    vote_count_for   INT,
    vote_count_against INT,
    approved_at      TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT id, title, status, vote_count_for, vote_count_against, approved_at
    FROM public.governance_proposals
    WHERE status IN ('approved', 'active')
    ORDER BY created_at DESC
    LIMIT p_limit;
$$;

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION public.get_treasury_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_creator_analytics(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_transactions(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_treasury_pool_entries(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_recent_disbursements(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_active_proposals(INT) TO service_role;

-- Add comments documenting the precision requirements
COMMENT ON FUNCTION public.get_treasury_summary() IS
    'Returns accurate treasury totals without row limit truncation. All amounts use NUMERIC for financial precision.';
COMMENT ON FUNCTION public.get_creator_analytics(UUID) IS
    'Returns aggregated creator analytics without client-side processing. Callers should use NUMERIC types for amounts.';


