-- ══════════════════════════════════════════════════════════════════════
-- Migration 005: Governance / Community Impact Audit Trail
-- governance_proposals, beneficiaries, community_projects,
-- impact_metrics, project_reports + vaal_pool governance linkage
-- Applied to Supabase: March 2026
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.governance_proposals (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT        NOT NULL,
  description       TEXT        NOT NULL,
  proposer_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  vote_count_for    INTEGER     NOT NULL DEFAULT 0,
  vote_count_against INTEGER    NOT NULL DEFAULT 0,
  quorum_required   INTEGER     NOT NULL DEFAULT 1,
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','active','approved','rejected','expired')),
  voting_deadline   TIMESTAMPTZ,
  approved_at       TIMESTAMPTZ,
  approved_by       TEXT,
  notes             TEXT,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_status     ON public.governance_proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_created_at ON public.governance_proposals(created_at DESC);

CREATE TRIGGER governance_proposals_updated_at
  BEFORE UPDATE ON public.governance_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.governance_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposals_public_read"   ON public.governance_proposals FOR SELECT USING (true);
CREATE POLICY "proposals_service_write" ON public.governance_proposals FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.beneficiaries (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  registration_no  TEXT        UNIQUE,
  entity_type      TEXT        NOT NULL DEFAULT 'npo'
                               CHECK (entity_type IN ('npo','pbo','community_trust','cooperative','individual')),
  contact_email    TEXT,
  contact_phone    TEXT,
  address          TEXT,
  verified         BOOLEAN     NOT NULL DEFAULT false,
  verified_by      TEXT,
  verification_date TIMESTAMPTZ,
  bank_account_ref TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER beneficiaries_updated_at
  BEFORE UPDATE ON public.beneficiaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.beneficiaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "beneficiaries_public_read"   ON public.beneficiaries FOR SELECT USING (true);
CREATE POLICY "beneficiaries_service_write" ON public.beneficiaries FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.community_projects (
  id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  title                TEXT           NOT NULL,
  description          TEXT,
  beneficiary_id       UUID           NOT NULL REFERENCES public.beneficiaries(id) ON DELETE RESTRICT,
  proposal_id          UUID           REFERENCES public.governance_proposals(id) ON DELETE SET NULL,
  budget               NUMERIC(15,2)  NOT NULL CHECK (budget > 0),
  disbursed_amount     NUMERIC(15,2)  NOT NULL DEFAULT 0,
  currency             TEXT           NOT NULL DEFAULT 'ZAR',
  status               TEXT           NOT NULL DEFAULT 'pending'
                                      CHECK (status IN ('pending','active','completed','suspended','cancelled')),
  start_date           DATE,
  end_date             DATE,
  province             TEXT,
  approved_by          TEXT,
  approval_timestamp   TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_beneficiary_id ON public.community_projects(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_projects_proposal_id    ON public.community_projects(proposal_id);
CREATE INDEX IF NOT EXISTS idx_projects_status         ON public.community_projects(status);

CREATE TRIGGER community_projects_updated_at
  BEFORE UPDATE ON public.community_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.community_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects_public_read"   ON public.community_projects FOR SELECT USING (true);
CREATE POLICY "projects_service_write" ON public.community_projects FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.impact_metrics (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID           NOT NULL REFERENCES public.community_projects(id) ON DELETE CASCADE,
  metric_name   TEXT           NOT NULL,
  unit          TEXT,
  target_value  NUMERIC(15,2)  NOT NULL,
  actual_value  NUMERIC(15,2),
  reported_at   TIMESTAMPTZ,
  period        TEXT,
  verified      BOOLEAN        NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_impact_metrics_project_id ON public.impact_metrics(project_id);
ALTER TABLE public.impact_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "impact_metrics_public_read"   ON public.impact_metrics FOR SELECT USING (true);
CREATE POLICY "impact_metrics_service_write" ON public.impact_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.project_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL REFERENCES public.community_projects(id) ON DELETE CASCADE,
  period        TEXT        NOT NULL,
  narrative     TEXT        NOT NULL,
  submitted_by  TEXT        NOT NULL,
  attachments   JSONB,
  reviewed      BOOLEAN     NOT NULL DEFAULT false,
  reviewed_by   TEXT,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_reports_project_id ON public.project_reports(project_id);
ALTER TABLE public.project_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports_public_read"   ON public.project_reports FOR SELECT USING (true);
CREATE POLICY "reports_service_write" ON public.project_reports FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.vaal_development_pool
  ADD COLUMN IF NOT EXISTS governance_proposal_id UUID REFERENCES public.governance_proposals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS community_project_id   UUID REFERENCES public.community_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disbursement_status    TEXT NOT NULL DEFAULT 'held'
                                                  CHECK (disbursement_status IN ('held','approved','disbursed','cancelled')),
  ADD COLUMN IF NOT EXISTS disbursed_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by            TEXT,
  ADD COLUMN IF NOT EXISTS notes                  TEXT;

CREATE INDEX IF NOT EXISTS idx_vaal_pool_proposal_id     ON public.vaal_development_pool(governance_proposal_id);
CREATE INDEX IF NOT EXISTS idx_vaal_pool_disburse_status ON public.vaal_development_pool(disbursement_status);
