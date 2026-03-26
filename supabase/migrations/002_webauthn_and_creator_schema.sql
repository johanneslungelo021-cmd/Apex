-- ══════════════════════════════════════════════════════════════════════
-- Migration 002 — WebAuthn, Creator Platform & Treasury Schema
-- Applied via Supabase MCP connector (sessions: Mar 2026)
-- Tables are created with IF NOT EXISTS — safe to re-run.
-- ══════════════════════════════════════════════════════════════════════

-- ── Shared trigger: auto-update updated_at ───────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── creators ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.creators (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name      TEXT        NOT NULL,
  bio               TEXT,
  avatar_url        TEXT,
  subscription_tier TEXT        NOT NULL DEFAULT 'free'
                                CHECK (subscription_tier IN ('free','basic','pro','enterprise')),
  total_earnings    NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_verified       BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT creators_user_id_unique UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_creators_user_id ON public.creators(user_id);
ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;

-- ── content ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID        NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  slug            TEXT        NOT NULL,
  body            TEXT,
  cover_image_url TEXT,
  content_type    TEXT        NOT NULL
                              CHECK (content_type IN ('article','video','course','template','ebook')),
  price           NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency        TEXT        NOT NULL DEFAULT 'ZAR',
  status          TEXT        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','published','archived','scheduled')),
  min_tier        TEXT        NOT NULL DEFAULT 'free'
                              CHECK (min_tier IN ('free','basic','pro','enterprise')),
  view_count      INTEGER     NOT NULL DEFAULT 0,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_creator_slug_unique UNIQUE (creator_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_content_creator_id     ON public.content(creator_id);
CREATE INDEX IF NOT EXISTS idx_content_status         ON public.content(status);
CREATE INDEX IF NOT EXISTS idx_content_creator_status ON public.content(creator_id, status);
ALTER TABLE public.content ENABLE ROW LEVEL SECURITY;

-- ── subscriptions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    UUID        NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  subscriber_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier          TEXT        NOT NULL DEFAULT 'basic'
                            CHECK (tier IN ('basic','pro','enterprise')),
  billing_cycle TEXT        NOT NULL DEFAULT 'monthly'
                            CHECK (billing_cycle IN ('monthly','annual')),
  status        TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','cancelled','past_due','trialing')),
  price_zar     NUMERIC(10,2) NOT NULL DEFAULT 0,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  renews_at     TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_creator_subscriber_unique UNIQUE (creator_id, subscriber_id)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_creator_id    ON public.subscriptions(creator_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_subscriber_id ON public.subscriptions(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status        ON public.subscriptions(status);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- ── transactions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id         UUID        NOT NULL REFERENCES public.creators(id) ON DELETE RESTRICT,
  payer_id           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  subscription_id    UUID        REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  content_id         UUID        REFERENCES public.content(id) ON DELETE SET NULL,
  amount_zar         NUMERIC(12,2) NOT NULL CHECK (amount_zar > 0),
  platform_fee_zar   NUMERIC(12,2) NOT NULL DEFAULT 0,
  creator_payout_zar NUMERIC(12,2) GENERATED ALWAYS AS (amount_zar - platform_fee_zar) STORED,
  gateway            TEXT        NOT NULL
                                 CHECK (gateway IN ('paystack','yoco','ozow','xrpl','manual')),
  gateway_ref        TEXT,
  xrpl_tx_hash       TEXT,
  external_id        TEXT        UNIQUE,       -- Paystack reference — idempotency key
  status             TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending','success','failed','refunded','disputed')),
  type               TEXT        NOT NULL DEFAULT 'subscription'
                                 CHECK (type IN ('subscription','one_time','tip','refund')),
  source_type        TEXT        DEFAULT 'standard_subscription',
  community_impact   BOOLEAN     NOT NULL DEFAULT false,
  emotion_state      TEXT        DEFAULT 'neutral',
  metadata           JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transactions_creator_id  ON public.transactions(creator_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payer_id    ON public.transactions(payer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status      ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_gateway     ON public.transactions(gateway);
CREATE INDEX IF NOT EXISTS idx_transactions_gateway_ref ON public.transactions(gateway_ref);
CREATE INDEX IF NOT EXISTS idx_transactions_external_id ON public.transactions(external_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at  ON public.transactions(created_at DESC);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- ── identities_private (WebAuthn credentials) ────────────────────────
-- Server-only: all RLS policies block direct client access.
CREATE TABLE IF NOT EXISTS public.identities_private (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT        NOT NULL,
  credential_id         TEXT        NOT NULL UNIQUE,
  credential_public_key TEXT        NOT NULL,    -- base64url encoded COSE public key
  counter               BIGINT      NOT NULL DEFAULT 0,
  transports            TEXT[]      DEFAULT '{}',
  device_type           TEXT        DEFAULT 'single_device'
                                    CHECK (device_type IN ('single_device','multi_device')),
  backed_up             BOOLEAN     NOT NULL DEFAULT false,
  registered_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_identities_private_user_id ON public.identities_private(user_id);
CREATE INDEX IF NOT EXISTS idx_identities_private_email   ON public.identities_private(email);
ALTER TABLE public.identities_private ENABLE ROW LEVEL SECURITY;

-- ── webauthn_challenges (TTL-enforced, single-use) ───────────────────
CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL,
  challenge  TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_email      ON public.webauthn_challenges(email);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires_at ON public.webauthn_challenges(expires_at);
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- ── vaal_development_pool ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vaal_development_pool (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID        NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  amount_zar     NUMERIC(12,2) NOT NULL,
  split_pct      NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vaal_pool_transaction_id ON public.vaal_development_pool(transaction_id);
ALTER TABLE public.vaal_development_pool ENABLE ROW LEVEL SECURITY;

-- ── Treasury trigger ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_treasury_split()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_split_pct   NUMERIC(5,2) := 5.00;
  v_pool_amount NUMERIC(12,2);
BEGIN
  IF NEW.status != 'success' THEN RETURN NEW; END IF;
  v_pool_amount := ROUND(NEW.amount_zar * (v_split_pct / 100), 2);
  IF NEW.community_impact = true THEN
    INSERT INTO public.vaal_development_pool (transaction_id, amount_zar, split_pct)
    VALUES (NEW.id, v_pool_amount, v_split_pct);
  END IF;
  UPDATE public.creators
  SET total_earnings = total_earnings + COALESCE(NEW.creator_payout_zar, NEW.amount_zar)
  WHERE id = NEW.creator_id;
  RETURN NEW;
END;
$$;

-- ── Purge helper for expired WebAuthn challenges ──────────────────────
CREATE OR REPLACE FUNCTION public.purge_expired_webauthn_challenges()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.webauthn_challenges WHERE expires_at < now();
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Post-merge hardening: set explicit search_path on all functions
-- Prevents search_path injection attacks (Supabase security advisor lint)
-- Applied: March 2026
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_webauthn_challenges()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.webauthn_challenges WHERE expires_at < now();
END;
$$;

CREATE OR REPLACE FUNCTION public.process_treasury_split()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_split_pct   NUMERIC(5,2) := 5.00;
  v_pool_amount NUMERIC(12,2);
BEGIN
  IF NEW.status != 'success' THEN RETURN NEW; END IF;
  v_pool_amount := ROUND(NEW.amount_zar * (v_split_pct / 100), 2);
  IF NEW.community_impact = true THEN
    INSERT INTO public.vaal_development_pool (transaction_id, amount_zar, split_pct)
    VALUES (NEW.id, v_pool_amount, v_split_pct);
  END IF;
  UPDATE public.creators
  SET total_earnings = total_earnings + COALESCE(NEW.creator_payout_zar, NEW.amount_zar)
  WHERE id = NEW.creator_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_treasury_split_on_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_split_pct   NUMERIC(5,2) := 5.00;
  v_pool_amount NUMERIC(12,2);
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status != 'success' THEN RETURN NEW; END IF;
  v_pool_amount := ROUND(NEW.amount_zar * (v_split_pct / 100), 2);
  IF NEW.community_impact = true THEN
    INSERT INTO public.vaal_development_pool (transaction_id, amount_zar, split_pct)
    VALUES (NEW.id, v_pool_amount, v_split_pct)
    ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.creators
  SET total_earnings = total_earnings + COALESCE(NEW.creator_payout_zar, NEW.amount_zar)
  WHERE id = NEW.creator_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_webauthn_credential(
  p_user_id UUID, p_email TEXT, p_credential_id TEXT,
  p_credential_public_key TEXT, p_counter BIGINT, p_transports TEXT[],
  p_device_type TEXT, p_backed_up BOOLEAN, p_registered_at TIMESTAMPTZ,
  p_challenge_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.identities_private (
    user_id, email, credential_id, credential_public_key,
    counter, transports, device_type, backed_up, registered_at
  ) VALUES (
    p_user_id, p_email, p_credential_id, p_credential_public_key,
    p_counter, p_transports, p_device_type, p_backed_up, p_registered_at
  );
  DELETE FROM public.webauthn_challenges WHERE id = p_challenge_id;
  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'Credential already registered', 'code', '23505');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM, 'code', SQLSTATE);
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Security: Revoke public access from SECURITY DEFINER functions
-- ══════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_treasury_split() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_treasury_split_on_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_webauthn_credential(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT[], TEXT, BOOLEAN, TIMESTAMPTZ, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_webauthn_challenges() FROM PUBLIC;
