/**
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
 *
 * @module lib/auth/store
 */

import { supabase } from '@/lib/supabase/server';

// ── Types ───────────────────────────────────────────────────────────

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
  lastLoginAt: string | null;
  province: string | null;
}

/** Raw row shape returned by Supabase (snake_case). */
interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: string;
  last_login_at: string | null;
  province: string | null;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Convert a Supabase row to the application-layer StoredUser shape. */
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

// ── Store Functions ──────────────────────────────────────────────────

/**
 * Find a user by their email address (case-insensitive — emails are
 * normalised to lowercase before storage).
 */
export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .maybeSingle<UserRow>();

  if (error) {
    console.error('[store] findUserByEmail error:', error.message);
    throw new Error('Database lookup failed.');
  }

  return data ? rowToUser(data) : null;
}

/**
 * Find a user by their UUID.
 */
export async function findUserById(id: string): Promise<StoredUser | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .maybeSingle<UserRow>();

  if (error) {
    console.error('[store] findUserById error:', error.message);
    throw new Error('Database lookup failed.');
  }

  return data ? rowToUser(data) : null;
}

/**
 * Insert a new user row.  Throws if the email already exists (unique
 * constraint) so the caller should call findUserByEmail first.
 */
export async function createUser(user: StoredUser): Promise<void> {
  const { error } = await supabase.from('users').insert({
    id: user.id,
    email: user.email,
    password_hash: user.passwordHash,
    display_name: user.displayName,
    created_at: user.createdAt,
    last_login_at: user.lastLoginAt,
    province: user.province,
  });

  if (error) {
    console.error('[store] createUser error:', error.message);
    throw new Error('Failed to create user.');
  }
}

/**
 * Update the province for a user (set in onboarding after registration).
 */
export async function updateUserProvince(id: string, province: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ province })
    .eq('id', id);

  if (error) {
    console.error('[store] updateUserProvince error:', error.message);
    throw new Error('Failed to update province.');
  }
}

/**
 * Stamp last_login_at with the current UTC time.
 */
export async function updateLastLogin(id: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[store] updateLastLogin error:', error.message);
    throw new Error('Failed to update last login.');
  }
}

/**
 * Return the total number of registered users.
 * Uses Supabase's count feature — no full table scan.
 */
export async function getUserCount(): Promise<number> {
  const { count, error } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('[store] getUserCount error:', error.message);
    throw new Error('Failed to get user count.');
  }

  return count ?? 0;
}
