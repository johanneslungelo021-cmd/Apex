/**
 * User Store — In-memory for MVP, swap for SQLite/Prisma later.
 * 
 * IMPORTANT: This store resets on every Vercel cold start.
 * For production persistence, migrate to:
 *   - db/custom.db via better-sqlite3, OR
 *   - Vercel Postgres / Supabase
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

// In-memory store — survives within a single serverless invocation lifetime
const users = new Map<string, StoredUser>();

export function findUserByEmail(email: string): StoredUser | null {
  for (const user of users.values()) {
    if (user.email === email) return user;
  }
  return null;
}

export function findUserById(id: string): StoredUser | null {
  return users.get(id) ?? null;
}

export function createUser(user: StoredUser): void {
  users.set(user.id, user);
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
