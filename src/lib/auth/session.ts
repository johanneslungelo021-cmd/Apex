/**
 * JWT Session Management — jose (Edge-compatible)
 *
 * Uses HS256 symmetric signing with AUTH_SECRET from env.
 * Tokens are stored in HttpOnly, Secure, SameSite=Lax cookies
 * so they're invisible to client-side JS (XSS-proof).
 *
 * Works with the existing CSP headers from Pillar 4:
 * - Strict-Transport-Security ensures HTTPS
 * - HttpOnly prevents document.cookie access
 *
 * @module lib/auth/session
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const COOKIE_NAME = 'apex-session';
const TOKEN_EXPIRY = '7d';

export interface SessionPayload extends JWTPayload {
  userId: string;
  email: string;
  displayName: string;
}

/**
 * Get the signing secret as a Uint8Array for jose.
 * Uses AUTH_SECRET env var; falls back to a dev-only placeholder.
 * Set AUTH_SECRET in Vercel Dashboard -> Settings -> Environment Variables
 * before going to production.
 */
function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET ?? 'apex-dev-secret-change-in-production';
  return new TextEncoder().encode(secret);
}

/**
 * Create a signed JWT for a user session.
 */
export async function createSession(payload: {
  userId: string;
  email: string;
  displayName: string;
}): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    email: payload.email,
    displayName: payload.displayName,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .setIssuer('apex-platform')
    .sign(getSecret());
}

/**
 * Verify and decode a JWT session token.
 * Returns null if the token is invalid, expired, or tampered with.
 */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: 'apex-platform',
    });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Build Set-Cookie header value for the session token.
 * HttpOnly + Secure + SameSite=Lax — invisible to JS, sent on same-site nav.
 */
export function buildSessionCookie(token: string): string {
  const isProduction = process.env.VERCEL_ENV === 'production';
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${7 * 24 * 60 * 60}`,
    isProduction ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

/**
 * Build Set-Cookie header that clears the session.
 */
export function buildLogoutCookie(): string {
  const isProduction = process.env.VERCEL_ENV === 'production';
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    isProduction ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

/**
 * Extract the session token from a Request's Cookie header.
 */
export function getTokenFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;

  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));

  return match ? match.slice(COOKIE_NAME.length + 1) : null;
}
