-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 008: Machine Payments Protocol (MPP) Foundation
-- Applied to Supabase: March 2026
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_gateway_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_gateway_check
  CHECK (gateway = ANY (ARRAY['paystack','yoco','ozow','xrpl','manual','tempo_mpp','visa_direct']));

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS mpp_settlement_id      TEXT,
  ADD COLUMN IF NOT EXISTS mpp_settlement_status  TEXT CHECK (mpp_settlement_status IN ('pending','bridging','settled','failed','reversed')),
  ADD COLUMN IF NOT EXISTS mpp_virtual_card_id    UUID,
  ADD COLUMN IF NOT EXISTS tempo_token_id         TEXT,
  ADD COLUMN IF NOT EXISTS visa_auth_code         TEXT,
  ADD COLUMN IF NOT EXISTS xrpl_to_zar_rate       NUMERIC(18,6),
  ADD COLUMN IF NOT EXISTS settlement_pathway     TEXT CHECK (settlement_pathway IN ('xrpl_direct','tempo_mpp','paystack_fallback','manual'));

CREATE INDEX IF NOT EXISTS idx_transactions_mpp_settlement_id ON public.transactions(mpp_settlement_id) WHERE mpp_settlement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_settlement_pathway ON public.transactions(settlement_pathway) WHERE settlement_pathway IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_tempo_token ON public.transactions(tempo_token_id) WHERE tempo_token_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.agent_virtual_cards (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          TEXT          NOT NULL UNIQUE,
  agent_label       TEXT          NOT NULL,
  tempo_card_token  TEXT          NOT NULL UNIQUE,
  visa_bin          TEXT          NOT NULL,
  last_four         TEXT          NOT NULL CHECK (last_four ~ '^\d{4}$'),
  expiry_month      INT           NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year       INT           NOT NULL CHECK (expiry_year >= 2026),
  currency          TEXT          NOT NULL DEFAULT 'ZAR',
  spending_limit_zar NUMERIC(12,2) NOT NULL DEFAULT 5000.00,
  balance_zar       NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status            TEXT          NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','suspended','cancelled')),
  purpose           TEXT          NOT NULL DEFAULT 'infrastructure',
  auto_replenish    BOOLEAN       NOT NULL DEFAULT true,
  replenish_threshold_zar NUMERIC(12,2) NOT NULL DEFAULT 500.00,
  replenish_amount_zar    NUMERIC(12,2) NOT NULL DEFAULT 2000.00,
  provisioned_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  last_used_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_cards_agent_id ON public.agent_virtual_cards(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_cards_status   ON public.agent_virtual_cards(status);
CREATE TRIGGER agent_virtual_cards_updated_at BEFORE UPDATE ON public.agent_virtual_cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.agent_virtual_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_cards_service_all" ON public.agent_virtual_cards FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.transactions ADD CONSTRAINT transactions_mpp_virtual_card_fkey FOREIGN KEY (mpp_virtual_card_id) REFERENCES public.agent_virtual_cards(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.mpp_settlement_log (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id      UUID          REFERENCES public.transactions(id) ON DELETE RESTRICT,
  settlement_pathway  TEXT          NOT NULL CHECK (settlement_pathway IN ('tempo_mpp','visa_direct','paystack_fallback')),
  xrpl_tx_hash        TEXT,
  xrpl_amount_drops   BIGINT,
  xrpl_ledger_index   BIGINT,
  tempo_ref           TEXT          UNIQUE,
  tempo_card_token    TEXT,
  visa_auth_code      TEXT,
  visa_network_id     TEXT,
  gross_amount_zar    NUMERIC(12,2) NOT NULL,
  tempo_fee_zar       NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  net_amount_zar      NUMERIC(12,2) NOT NULL,
  exchange_rate       NUMERIC(18,6),
  status              TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','bridging','settled','failed','reversed')),
  failure_reason      TEXT,
  settled_at          TIMESTAMPTZ,
  initiated_by        TEXT          NOT NULL DEFAULT 'system',
  webhook_payload     JSONB,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mpp_log_transaction_id  ON public.mpp_settlement_log(transaction_id);
CREATE INDEX IF NOT EXISTS idx_mpp_log_tempo_ref       ON public.mpp_settlement_log(tempo_ref) WHERE tempo_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mpp_log_status          ON public.mpp_settlement_log(status);
CREATE INDEX IF NOT EXISTS idx_mpp_log_xrpl_hash       ON public.mpp_settlement_log(xrpl_tx_hash) WHERE xrpl_tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mpp_log_created_at      ON public.mpp_settlement_log(created_at DESC);
CREATE TRIGGER mpp_settlement_log_updated_at BEFORE UPDATE ON public.mpp_settlement_log FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.mpp_settlement_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mpp_log_service_all" ON public.mpp_settlement_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "mpp_log_creator_own_read" ON public.mpp_settlement_log FOR SELECT TO authenticated
  USING (transaction_id IN (SELECT t.id FROM transactions t JOIN creators c ON c.id = t.creator_id WHERE c.user_id = (SELECT auth.uid())));
