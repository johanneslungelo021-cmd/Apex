-- ══════════════════════════════════════════════════════════════════════
-- Migration 010: System Creator for MPP Treasury Payments
-- Inserts a deterministic system user + creator row so that treasury
-- and system-level MPP payments can reference a valid creator_id FK.
-- Applied to Supabase: March 2026
-- ══════════════════════════════════════════════════════════════════════

-- System user in auth.users (required by creators.user_id FK)
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'system@apex.internal',
  '{"role": "system", "display_name": "Apex System"}'::jsonb,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- System creator record
INSERT INTO public.creators (id, user_id, display_name, bio, subscription_tier, is_verified)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Apex System',
  'System account for treasury and automated MPP payments',
  'enterprise',
  true
)
ON CONFLICT (id) DO NOTHING;
