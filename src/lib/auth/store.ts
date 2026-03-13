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

import { getSupabaseClient } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────

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

// ── Store Functions ───────────────────────────────────────────

/**
 * Find a user by their email address (case-insensitive).
 */
export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('users')
    .select('id, email, password_hash, display_name, created_at, last_login_at, province')
    .eq('email', email)
    .maybeSingle();

  if (error) throw new Error(`[store] findUserByEmail: ${error.message}`);
  return data ? rowToUser(data as unknown as UserRow) : null;
}

/**
 * Find a user by their UUID.
 */
export async function findUserById(id: string): Promise<StoredUser | null> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('users')
    .select('id, email, display_name, created_at, last_login_at, province')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`[store] findUserById: ${error.message}`);
  return data ? rowToUser(data as unknown as UserRow) : null;
}

/**
 * Insert a new user row.
 */
export async function createUser(user: StoredUser): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db.from('users').insert({
    id: user.id,
    email: user.email,
    password_hash: user.passwordHash,
    display_name: user.displayName,
    created_at: user.createdAt,
    last_login_at: user.lastLoginAt,
    province: user.province,
  });

  if (error) {
    if (error.code === '23505' && error.details?.toLowerCase().includes('(email)')) {
      throw new Error('DUPLICATE_EMAIL');
    }
    throw new Error(`[store] createUser: ${error.message}`);
  }
}

/**
 * Update the province for a user.
 */
export async function updateUserProvince(id: string, province: string): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db
    .from('users')
    .update({ province })
    .eq('id', id);

  if (error) throw new Error(`[store] updateUserProvince: ${error.message}`);
}

/**
 * Stamp last_login_at with the current UTC time.
 */
export async function updateLastLogin(id: string): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`[store] updateLastLogin: ${error.message}`);
}

/**
 * Return the total number of registered users.
 */
export async function getUserCount(): Promise<number> {
  const db = getSupabaseClient();
  const { count, error } = await db
    .from('users')
    .select('*', { count: 'exact', head: true });

  if (error) throw new Error(`[store] getUserCount: ${error.message}`);
  return count ?? 0;
}
