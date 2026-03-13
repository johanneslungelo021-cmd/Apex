/**
 feat/supabase-auth-persistence
 * User Store — Supabase Postgres (persistent across Vercel cold starts).
 *
 * Replaces the previous in-memory Map implementation that reset on every
 * serverless invocation. Public interface is identical — all functions
 * now return Promises so callers must await them.
 *
 * Table: public.users  (see supabase/migrations/001_create_users_table.sql)
 *
 * Column mapping:
 *   StoredUser.id            → users.id
 *   StoredUser.email         → users.email
 *   StoredUser.passwordHash  → users.password_hash
 *   StoredUser.displayName   → users.display_name
 *   StoredUser.createdAt     → users.created_at
 *   StoredUser.lastLoginAt   → users.last_login_at
 *   StoredUser.province      → users.province

 * User Store — Supabase Postgres backend.
 *
 * Replaces the in-memory Map that reset on every Vercel cold start.
 * All operations go through the service-role Supabase client which
 * bypasses RLS — only called from Vercel API routes, never the browser.
 *
 * Table: public.users  (created by supabase/migrations/001_users.sql)
 main
 *
 * @module lib/auth/store
 */

import { getSupabaseClient } from '@/lib/supabase';

 feat/supabase-auth-persistence
// ── Types ────────────────────────────────────────────────────────

main
export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
  lastLoginAt: string | null;
  province: string | null;
}

 feat/supabase-auth-persistence
/** Raw row shape returned by Supabase (snake_case). */
interface UserRow {
  id: string;
  email: string;
  password_hash: string;

// ─── Row shape returned by Supabase (snake_case) ──────────────────────────────
interface UserRow {
  id: string;
  email: string;
  password_hash: string;  // empty string when not selected (profile-only queries)
 main
  display_name: string;
  created_at: string;
  last_login_at: string | null;
  province: string | null;
}
 feat/supabase-auth-persistence

// ── Helpers ───────────────────────────────────────────────────

/** Convert a Supabase row to the application-layer StoredUser shape. */


 main
function rowToUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
 feat/supabase-auth-persistence
    passwordHash: row.password_hash,

    passwordHash: row.password_hash ?? '',
 main
    displayName: row.display_name,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    province: row.province,
  };
}

<<feat/supabase-auth-persistence
// ── Store Functions ───────────────────────────────────────────

/**
 * Find a user by their email address (case-insensitive).

// ─── Public async API ─────────────────────────────────────────────────────────
// All exported functions return Promises — always await at the call site.
// (Breaking change from the previous synchronous in-memory Map API.)

/**
 * Credential lookup — projects id, email, password_hash, display_name,
 * created_at, last_login_at, province. Includes password_hash for bcrypt
 * verification in login. Never expose the result directly to the client.
 main
 */
export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('users')
    .select('id, email, password_hash, display_name, created_at, last_login_at, province')
 feat/supabase-auth-persistence
    .eq('email', email)
    .maybeSingle();

  if (error) throw new Error(`[store] findUserByEmail: ${error.message}`);

    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (error) throw new Error(`[store] findUserByEmail: ${error.message}`);
  // Supabase returns an untyped Json union without a Database generic.
  // The double cast (unknown → UserRow) is intentional: shape guaranteed by migration.
 main
  return data ? rowToUser(data as unknown as UserRow) : null;
}

/**
 feat/supabase-auth-persistence
 * Find a user by their UUID.

 * Profile lookup — projects id, email, display_name, created_at,
 * last_login_at, province. password_hash is intentionally NOT selected
 * to minimise sensitive-data exposure in /api/auth/me and duplicate checks.
 main
 */
export async function findUserById(id: string): Promise<StoredUser | null> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('users')
    .select('id, email, display_name, created_at, last_login_at, province')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`[store] findUserById: ${error.message}`);
 feat/supabase-auth-persistence
  return data ? rowToUser(data as unknown as UserRow) : null;
}

/**
 * Insert a new user row.
 */

  // password_hash not in projection — cast still safe, field defaults to '' via rowToUser.
  return data ? rowToUser(data as unknown as UserRow) : null;
}

 main
export async function createUser(user: StoredUser): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db.from('users').insert({
    id: user.id,
 feat/supabase-auth-persistence
    email: user.email,
    password_hash: user.passwordHash,
    display_name: user.displayName,
    created_at: user.createdAt,
    last_login_at: user.lastLoginAt,
    province: user.province,
  });

  if (error) {
    if (error.code === '23505' && error.details?.toLowerCase().includes('(email)')) {

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
 main
      throw new Error('DUPLICATE_EMAIL');
    }
    throw new Error(`[store] createUser: ${error.message}`);
  }
}

 feat/supabase-auth-persistence
/**
 * Update the province for a user.
 */

 main
export async function updateUserProvince(id: string, province: string): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db
    .from('users')
    .update({ province })
    .eq('id', id);

  if (error) throw new Error(`[store] updateUserProvince: ${error.message}`);
}

 feat/supabase-auth-persistence
/**
 * Stamp last_login_at with the current UTC time.
 */

 main
export async function updateLastLogin(id: string): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`[store] updateLastLogin: ${error.message}`);
}

 feat/supabase-auth-persistence
/**
 * Return the total number of registered users.
 */

 main
export async function getUserCount(): Promise<number> {
  const db = getSupabaseClient();
  const { count, error } = await db
    .from('users')
    .select('*', { count: 'exact', head: true });

  if (error) throw new Error(`[store] getUserCount: ${error.message}`);
  return count ?? 0;
}
