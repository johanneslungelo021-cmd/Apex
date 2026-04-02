/**
 * Password Hashing — bcryptjs (pure JS, Vercel-compatible)
 *
 * Cost factor 12 = ~250ms per hash on Vercel Serverless.
 * Matches the security level of the timingSafeEqual pattern
 * already used in /api/health.
 *
 * @module lib/auth/password
 */

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/**
 * Hash a plaintext password with bcrypt.
 * @param password - Plaintext password (min 8 chars enforced by caller)
 * @returns Promise resolving to bcrypt hash string
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a bcrypt hash.
 * Timing-safe comparison is built into bcrypt.compare.
 * @param password - Plaintext password attempt
 * @param hash - Stored bcrypt hash
 * @returns Promise resolving to true if password matches
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
