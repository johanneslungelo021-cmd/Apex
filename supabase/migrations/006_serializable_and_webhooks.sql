-- ══════════════════════════════════════════════════════════════════════
-- Migration 006: Serializable RPC + webhook_events idempotency log
-- Applied to Supabase: March 2026
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.insert_transaction_serializable(
  p_creator_id UUID, p_customer_id UUID, p_amount_zar NUMERIC(12,2),
  p_platform_fee_zar NUMERIC(12,2), p_gateway TEXT, p_gateway_ref TEXT,
  p_external_id TEXT, p_status TEXT, p_type TEXT, p_source_type TEXT,
  p_community_impact BOOLEAN, p_emotion_state TEXT, p_is_cross_border BOOLEAN,
  p_source_currency TEXT, p_destination_currency TEXT, p_source_country TEXT,
  p_destination_country TEXT, p_metadata JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET default_transaction_isolation = 'serializable'
AS $$
DECLARE v_tx RECORD;
BEGIN
  INSERT INTO public.transactions (
    creator_id, customer_id, amount_zar, platform_fee_zar, gateway, gateway_ref,
    external_id, status, type, source_type, community_impact, emotion_state,
    is_cross_border, source_currency, destination_currency, source_country,
    destination_country, metadata
  ) VALUES (
    p_creator_id, p_customer_id, p_amount_zar, p_platform_fee_zar, p_gateway,
    p_gateway_ref, p_external_id, p_status, p_type, p_source_type,
    p_community_impact, p_emotion_state, p_is_cross_border, p_source_currency,
    p_destination_currency, p_source_country, p_destination_country, p_metadata
  ) RETURNING * INTO v_tx;
  RETURN jsonb_build_object('id', v_tx.id, 'creator_id', v_tx.creator_id,
    'amount_zar', v_tx.amount_zar, 'status', v_tx.status,
    'emotion_state', v_tx.emotion_state, 'created_at', v_tx.created_at);
EXCEPTION
  WHEN unique_violation     THEN RETURN jsonb_build_object('error','DUPLICATE','code','23505');
  WHEN serialization_failure THEN RETURN jsonb_build_object('error','SERIALIZATION_FAILURE','code','40001');
  WHEN OTHERS               THEN RETURN jsonb_build_object('error', SQLERRM, 'code', SQLSTATE);
END;
$$;

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source           TEXT        NOT NULL CHECK (source IN ('outstand','paystack','dao','strackr','manual')),
  external_id      TEXT        NOT NULL,
  event_type       TEXT        NOT NULL,
  payload          JSONB       NOT NULL,
  processed        BOOLEAN     NOT NULL DEFAULT false,
  processing_error TEXT,
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT webhook_events_source_external_unique UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_source     ON public.webhook_events(source);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed  ON public.webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON public.webhook_events(created_at DESC);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_events_service_all" ON public.webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════
-- Security: Revoke public access from SECURITY DEFINER functions
-- ══════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.insert_transaction_serializable(UUID, UUID, NUMERIC(12,2), NUMERIC(12,2), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
