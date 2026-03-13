-- ══════════════════════════════════════════════════════════════════════
-- Migration 001 — Create users table
-- Run once in: Supabase Dashboard → SQL Editor
-- Or via CLI: supabase db push
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.users (
  id            uuid         primary key,
  email         text         unique not null,
  password_hash text         not null,
  display_name  text         not null,
  created_at    timestamptz  not null default now(),
  last_login_at timestamptz,
  province      text
);

comment on table public.users is
  'Apex platform users — managed exclusively by the service role via API routes.';
comment on column public.users.password_hash is
  'bcrypt hash (cost 12) — never store plaintext passwords.';

-- ── Row Level Security ──────────────────────────────────────────────
-- Enable RLS as defence-in-depth. The service role key used by our
-- API routes bypasses RLS automatically (Supabase design), so our
-- server-side code works fine. Direct client/anon queries are blocked.
alter table public.users enable row level security;

-- Deny all access from anon / authenticated roles at the RLS layer.
-- Our API routes use the service role and are exempt from these policies.
create policy "block_anon_reads" on public.users
  for select using (false);

create policy "block_anon_writes" on public.users
  for all using (false) with check (false);

-- ── Indexes ─────────────────────────────────────────────────────────
-- Fast email lookup on login/register
create index if not exists users_email_idx on public.users (email);
