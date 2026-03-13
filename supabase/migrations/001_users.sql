-- ══════════════════════════════════════════════════════════
-- Apex — Users table migration
-- Region: West EU (Ireland)
-- Run once in Supabase Dashboard → SQL Editor.
-- ══════════════════════════════════════════════════════════

-- citext gives case-insensitive UNIQUE on email without a separate index.
-- The UNIQUE constraint itself creates the B-tree index; no extra CREATE INDEX needed.
create extension if not exists citext;

create table if not exists public.users (
  id            uuid        primary key default gen_random_uuid(),
  email         citext      unique not null,
  password_hash text        not null,
  display_name  text        not null check (char_length(display_name) between 2 and 50),
  province      text        null,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz null
);

-- Row Level Security: all reads/writes go through the service-role key
-- from Vercel API routes, never directly from the browser.
alter table public.users enable row level security;

-- No RLS policies are defined here intentionally.
-- The service-role key (used by src/lib/supabase.ts) bypasses RLS entirely.
-- Add targeted policies here only if you introduce client-side Supabase calls.
