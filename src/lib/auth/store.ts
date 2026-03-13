/**
 * User Store — Supabase Postgres backend.
 *
 * Replaces the in-memory Map that reset on every Vercel cold start.
 * All operations go through the service-role Supabase client which
 * bypasses RLS — only called from Vercel API routes, never the browser.
 *
 * Table: public.users  (created by supabase/migrations/001_users.sql)
 *
 * @module lib/auth/store
 */

import { getSupabaseClient } from '@/lib/supabase';

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
  lastLoginAt: string | null;
  province: string | null;
}

// ─── Row shape from Supabase (snake_case) ────────────────────────────────────
interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: string;
  last_login_at: string | null;
  province: string | null;
}

function rowToUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    province: row.province,
  };
}

// ─── Public async API ────────────────────────────────────────────────
// All exported functions return Promises — always await at the call site.
// (Breaking change from the previous synchronous in-memory Map API.)

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (error) throw new Error(`[store] findUserByEmail: ${error.message}`);
  // Supabase returns an untyped Json union when no Database generic is provided.
  // The double cast (unknown → UserRow) is intentional: shape guaranteed by migration.
  return data ? rowToUser(data as unknown as UserRow) : null;
}

export async function findUserById(id: string): Promise<StoredUser | null> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`[store] findUserById: ${error.message}`);
  // Same intentional double-cast as findUserByEmail.
  return data ? rowToUser(data as unknown as UserRow) : null;
}

export async function createUser(user: StoredUser): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db.from('users').insert({
    id: user.id,
    email: user.email.toLowerCase().trim(),
    password_hash: user.passwordHash,
    display_name: user.displayName,
    province: user.province ?? null,
    created_at: user.createdAt,
    last_login_at: user.lastLoginAt ?? null,
  });

  if (error) {
    // Only map to DUPLICATE_EMAIL when the violated constraint is the email
    // unique index. A primary-key collision (also code 23505) would have
    // error.details containing '(id)' not '(email)' and must not be swallowed.
    if (
      error.code === '23505' &&
      error.details?.toLowerCase().includes('(email)')
    ) {
      throw new Error('DUPLICATE_EMAIL');
    }
    throw new Error(`[store] createUser: ${error.message}`);
  }
}

export async function updateUserProvince(id: string, province: string): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db
    .from('users')
    .update({ province })
    .eq('id', id);

  if (error) throw new Error(`[store] updateUserProvince: ${error.message}`);
}

export async function updateLastLogin(id: string): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`[store] updateLastLogin: ${error.message}`);
}

export async function getUserCount(): Promise<number> {
  const db = getSupabaseClient();
  const { count, error } = await db
    .from('users')
    .select('*', { count: 'exact', head: true });

  if (error) throw new Error(`[store] getUserCount: ${error.message}`);
  return count ?? 0;
}
