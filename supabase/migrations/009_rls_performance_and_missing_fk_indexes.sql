-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 009: RLS Performance Fixes + Missing FK Indexes
-- Applied to Supabase: March 2026
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_disbursement_log_auditor_id ON public.disbursement_log(auditor_id) WHERE auditor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_disbursement_log_beneficiary_id ON public.disbursement_log(beneficiary_id) WHERE beneficiary_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_proposer_id ON public.governance_proposals(proposer_id) WHERE proposer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_content_id ON public.transactions(content_id) WHERE content_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_mpp_virtual_card_id ON public.transactions(mpp_virtual_card_id) WHERE mpp_virtual_card_id IS NOT NULL;
DROP INDEX IF EXISTS public.idx_vaal_pool_governance;

DROP POLICY IF EXISTS "transactions_select_own_payer"   ON public.transactions;
DROP POLICY IF EXISTS "transactions_select_own_creator" ON public.transactions;
CREATE POLICY "transactions_select_own_payer" ON public.transactions FOR SELECT TO authenticated USING (payer_id = (SELECT auth.uid()));
CREATE POLICY "transactions_select_own_creator" ON public.transactions FOR SELECT TO authenticated USING (creator_id = (SELECT auth.uid())::uuid);

DROP POLICY IF EXISTS "vaal_pool_select_own_creator" ON public.vaal_development_pool;
CREATE POLICY "vaal_pool_select_own_creator" ON public.vaal_development_pool FOR SELECT TO authenticated
  USING (transaction_id IN (SELECT t.id FROM transactions t JOIN creators c ON c.id = t.creator_id WHERE c.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "customers_own_read" ON public.customers;
CREATE POLICY "customers_own_read" ON public.customers FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "disbursement_log_auditor_read" ON public.disbursement_log;
CREATE POLICY "disbursement_log_auditor_read" ON public.disbursement_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM auth.users u WHERE u.id = (SELECT auth.uid()) AND (u.raw_user_meta_data->>'role')::text = 'auditor'));

DROP POLICY IF EXISTS "mpp_log_creator_own_read" ON public.mpp_settlement_log;
CREATE POLICY "mpp_log_creator_own_read" ON public.mpp_settlement_log FOR SELECT TO authenticated
  USING (transaction_id IN (SELECT t.id FROM transactions t JOIN creators c ON c.id = t.creator_id WHERE c.user_id = (SELECT auth.uid())));
