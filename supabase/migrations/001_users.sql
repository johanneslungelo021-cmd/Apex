fix/inline-review-fixes
-- ══════════════════════════════════════════════════════════════
-- Apex — Users table migration
-- Project: xdkojaigrjhzjkqxguxh (West EU — Ireland)
-- ══════════════════════════════════════════════════════════════

-- citext gives us case-insensitive UNIQUE on email without extra indexes.
create extension if not exists citext;

create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         citext unique not null,
  password_hash text   not null,
  display_name  text   not null check (char_length(display_name) between 2 and 50),
  province      text   null,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz null
);

-- Fast lookup by email (citext already indexes it as UNIQUE, this is explicit)
create index if not exists users_email_idx on public.users (email);

-- Row Level Security — all reads/writes go through the service-role key
-- from Vercel API routes, never from the browser directly.
alter table public.users enable row level security;

-- Deny all direct browser access. Vercel uses the service-role key which
-- bypasses RLS entirely, so no policies are needed for server-side ops.
-- If you ever add client-side Supabase calls, add policies here.

-- Enable the citext extension for case-insensitive string types
CREATE EXTENSION IF NOT EXISTS citext;

-- Create users table with CITEXT for the email column
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT UNIQUE NOT NULL,
    display_name TEXT,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure a functional unique index is also present as a fallback/best practice
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
 main
