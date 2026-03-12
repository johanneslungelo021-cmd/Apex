/**
 * User Store — In-memory for MVP, swap for Supabase/Prisma later.
 *
 * IMPORTANT: This store resets on every Vercel cold start.
 * For production persistence, migrate to Supabase or Neon (Postgres).
 *
 * The emailIndex Map provides atomic email uniqueness:
 * emailIndex.has(email) + emailIndex.set(email, id) in the same
 * synchronous tick is effectively atomic in Node.js single-threaded model,
 * preventing TOCTOU race conditions on concurrent registrations.
 *
 * @module lib/auth/store
 */

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  createdAt: string;
  lastLoginAt: string | null;
  province: string | null;
}

// Primary store keyed by user ID
const users = new Map<string, StoredUser>();

// Secondary index keyed by normalised email — enables O(1) lookup + atomic uniqueness
const emailIndex = new Map<string, string>(); // email → userId

export function findUserByEmail(email: string): StoredUser | null {
  const id = emailIndex.get(email.toLowerCase());
  if (!id) return null;
  return users.get(id) ?? null;
}

export function findUserById(id: string): StoredUser | null {
  return users.get(id) ?? null;
}

/**
 * Atomically create a user only if the email is not already registered.
 * Returns false if the email already exists (safe for concurrent requests).
 */
export function createUser(user: StoredUser): boolean {
  const email = user.email.toLowerCase();
  if (emailIndex.has(email)) return false; // atomic — no race possible
  emailIndex.set(email, user.id);
  users.set(user.id, user);
  return true;
}

export function updateUserProvince(id: string, province: string): void {
  const user = users.get(id);
  if (user) {
    user.province = province;
  }
}

export function updateLastLogin(id: string): void {
  const user = users.get(id);
  if (user) {
    user.lastLoginAt = new Date().toISOString();
  }
}

export function getUserCount(): number {
  return users.size;
}
