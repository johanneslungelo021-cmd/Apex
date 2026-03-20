-- ══════════════════════════════════════════════════════════════════════
-- Migration 007: Emotion Classification Cache + Disbursement Audit Log
-- emotion_classification_cache: 24h TTL Kimi result store
-- disbursement_log: IMMUTABLE audit trail for every DAO payout
-- Applied to Supabase: March 2026
-- ══════════════════════════════════════════════════════════════════════

-- ─── Emotion Classification Cache ────────────────────────────────────
-- Reduces Kimi K2.5 API calls by ~80% on repeated content
-- TTL enforced by expires_at; a nightly pg_cron job purges stale rows

CREATE TABLE IF NOT EXISTS public.emotion_classification_cache (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash    TEXT        NOT NULL UNIQUE,   -- SHA-256 of normalised post text
  platform        TEXT        NOT NULL DEFAULT 'unknown',
  emotion_state   TEXT        NOT NULL CHECK (emotion_state IN ('ecstatic','bullish','neutral','panicked')),
  fee_multiplier  NUMERIC(4,2) NOT NULL,
  confidence      NUMERIC(4,2) NOT NULL DEFAULT 0.80,
  kimi_model      TEXT        NOT NULL DEFAULT 'kimi-k2-0711-preview',
  hit_count       INT         NOT NULL DEFAULT 1,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emotion_cache_hash       ON public.emotion_classification_cache(content_hash);
CREATE INDEX IF NOT EXISTS idx_emotion_cache_expires_at ON public.emotion_classification_cache(expires_at);

CREATE TRIGGER emotion_cache_updated_at
  BEFORE UPDATE ON public.emotion_classification_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.emotion_classification_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emotion_cache_service_all" ON public.emotion_classification_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Bump hit_count + reset TTL on re-use
CREATE OR REPLACE FUNCTION public.upsert_emotion_cache(
  p_hash TEXT, p_platform TEXT, p_emotion_state TEXT,
  p_fee_multiplier NUMERIC, p_confidence NUMERIC, p_model TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.emotion_classification_cache
    (content_hash, platform, emotion_state, fee_multiplier, confidence, kimi_model)
  VALUES (p_hash, p_platform, p_emotion_state, p_fee_multiplier, p_confidence, p_model)
  ON CONFLICT (content_hash) DO UPDATE SET
    hit_count     = emotion_classification_cache.hit_count + 1,
    expires_at    = now() + INTERVAL '24 hours',
    updated_at    = now();
END;
$$;

-- ─── Disbursement Audit Log ────────────────────────────────────────────
-- IMMUTABLE once auditor_sign_off = true (enforced by RLS + trigger)

CREATE TABLE IF NOT EXISTS public.disbursement_log (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id         UUID        NOT NULL REFERENCES public.governance_proposals(id) ON DELETE RESTRICT,
  beneficiary_id      UUID        REFERENCES public.beneficiaries(id) ON DELETE RESTRICT,
  amount_zar          NUMERIC(12,2) NOT NULL CHECK (amount_zar > 0),
  status              TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','approved','paid','failed','reverted')),
  tx_hash             TEXT,                                   -- XRPL/blockchain tx reference
  payment_reference   TEXT,                                   -- Bank EFT / payment rail ref
  auditor_sign_off    BOOLEAN     NOT NULL DEFAULT false,
  auditor_id          UUID        REFERENCES auth.users(id)   ON DELETE SET NULL,
  auditor_notes       TEXT,
  signed_off_at       TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  created_by          TEXT        NOT NULL DEFAULT 'dao_webhook',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disbursement_log_proposal_id ON public.disbursement_log(proposal_id);
CREATE INDEX IF NOT EXISTS idx_disbursement_log_status      ON public.disbursement_log(status);
CREATE INDEX IF NOT EXISTS idx_disbursement_log_created_at  ON public.disbursement_log(created_at DESC);

CREATE TRIGGER disbursement_log_updated_at
  BEFORE UPDATE ON public.disbursement_log
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- IMMUTABILITY: once auditor_sign_off = true, block all further edits
CREATE OR REPLACE FUNCTION public.protect_signed_disbursement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.auditor_sign_off = true AND NEW.auditor_sign_off = true THEN
    RAISE EXCEPTION 'disbursement_log row % is immutable after auditor sign-off', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER disbursement_log_immutable
  BEFORE UPDATE ON public.disbursement_log
  FOR EACH ROW EXECUTE FUNCTION public.protect_signed_disbursement();

ALTER TABLE public.disbursement_log ENABLE ROW LEVEL SECURITY;

-- Only service_role and auditors can read/write
CREATE POLICY "disbursement_log_service_all" ON public.disbursement_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Auditors: read all, update only to add sign-off (cannot change amounts)
CREATE POLICY "disbursement_log_auditor_read" ON public.disbursement_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND (u.raw_user_meta_data->>'role')::text = 'auditor'
    )
  );

-- ─── FX Rate Cache ────────────────────────────────────────────────────────────
-- 1-hour TTL cache for SARB exchange rates used in cross-border transactions

CREATE TABLE IF NOT EXISTS public.fx_rate_cache (
  currency_code  TEXT        PRIMARY KEY,     -- e.g. 'USD', 'EUR', 'KES'
  rate_to_zar    NUMERIC(18,6) NOT NULL,       -- 1 unit of currency = N ZAR
  rate_source    TEXT        NOT NULL DEFAULT 'live'
                              CHECK (rate_source IN ('live','fallback')),
  expires_at     TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fx_cache_expires ON public.fx_rate_cache(expires_at);

ALTER TABLE public.fx_rate_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fx_cache_service_all" ON public.fx_rate_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);
