-- ══════════════════════════════════════════════════════════════════════
-- Migration 004: FICA/SARB Compliance
-- customers table (KYC), cross-border fields on transactions,
-- suspicious activity flagging (FIC Act)
-- Applied to Supabase: March 2026
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.customers (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name            TEXT        NOT NULL,
  id_number            TEXT        NOT NULL UNIQUE,
  id_type              TEXT        NOT NULL DEFAULT 'sa_id'
                                   CHECK (id_type IN ('sa_id', 'passport', 'refugee_id')),
  proof_of_residence   TEXT,
  date_of_birth        DATE,
  nationality          TEXT,
  risk_level           TEXT        NOT NULL DEFAULT 'medium'
                                   CHECK (risk_level IN ('low', 'medium', 'high')),
  pep_status           BOOLEAN     NOT NULL DEFAULT false,
  verification_date    TIMESTAMPTZ,
  last_review_date     TIMESTAMPTZ,
  verified_by          TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_user_id    ON public.customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_id_number  ON public.customers(id_number);
CREATE INDEX IF NOT EXISTS idx_customers_risk_level ON public.customers(risk_level);

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_service_role_all" ON public.customers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "customers_own_read" ON public.customers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS customer_id          UUID        REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_cross_border      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_currency      TEXT,
  ADD COLUMN IF NOT EXISTS destination_currency TEXT,
  ADD COLUMN IF NOT EXISTS source_country       TEXT,
  ADD COLUMN IF NOT EXISTS destination_country  TEXT,
  ADD COLUMN IF NOT EXISTS is_suspicious        BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS report_reference_id  TEXT,
  ADD COLUMN IF NOT EXISTS flagged_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS flagged_by           TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_customer_id  ON public.transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_cross_border ON public.transactions(is_cross_border) WHERE is_cross_border = true;
CREATE INDEX IF NOT EXISTS idx_transactions_suspicious   ON public.transactions(is_suspicious) WHERE is_suspicious = true;
