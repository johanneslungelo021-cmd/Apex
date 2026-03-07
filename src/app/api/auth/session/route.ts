/**
 * Session Validation Endpoint
 *
 * Returns the current user derived from the 'session' httpOnly cookie.
 * Called by the frontend on page load to restore login state.
 *
 * GET /api/auth/session
 *
 * Response (logged in):
 *   { "user": { "domain": "gmail.com", "registeredAt": 1700000000 } }
 *
 * Response (not logged in / expired):
 *   { "user": null }
 *
 * @module api/auth/session
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';

const JWT_HEADER_B64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  .toString('base64url');

/**
 * Verifies a JWT signed with HMAC-SHA256.
 * Returns the payload on success, null on any failure (invalid, expired, tampered).
 */
function verifyJwt(
  token: string,
  secret: string,
): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, sig] = parts;

  // Verify header matches what we issue
  if (header !== JWT_HEADER_B64) return null;

  // Constant-time signature verification
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (diff !== 0) return null;

  // Decode payload
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8'),
    ) as Record<string, unknown>;

    // Check expiry
    if (typeof decoded.exp === 'number' && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

export async function GET(req: Request): Promise<Response> {
  const jwtSecret = (process.env.JWT_SECRET ?? '').trim();

  if (!jwtSecret) {
    // Auth not configured — return null user gracefully (auth is optional)
    return NextResponse.json({ user: null });
  }

  const cookieHeader = req.headers.get('cookie') ?? '';
  const sessionMatch = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  const token = sessionMatch?.[1] ?? '';

  if (!token) {
    return NextResponse.json({ user: null });
  }

  const payload = verifyJwt(token, jwtSecret);

  if (!payload) {
    // Invalid or expired token — clear the cookie
    const res = NextResponse.json({ user: null });
    res.cookies.set('session', '', { maxAge: 0, path: '/' });
    return res;
  }

  return NextResponse.json({
    user: {
      domain: payload.domain ?? null,
      registeredAt: payload.iat ?? null,
    },
  });
}
