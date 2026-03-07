/**
 * User Registration API Route
 *
 * Validates the email, emits registration metrics, and issues a signed
 * JWT session cookie so the user is immediately logged in after registering.
 *
 * JWT payload: { sub: hashedEmail, domain: emailDomain, iat: timestamp }
 * Cookie: 'session' — httpOnly, secure (HTTPS only), SameSite=Lax, 7-day max-age.
 *
 * @module api/register
 */

import { NextResponse } from 'next/server';
import { registrationCounter } from '@/lib/metrics';
import crypto from 'crypto';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** JWT header — HS256 */
const JWT_HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  .toString('base64url');

/**
 * Signs a minimal JWT using HMAC-SHA256.
 * Production-grade libraries (jose, jsonwebtoken) are an acceptable upgrade;
 * this implementation avoids adding a dependency for a simple session token.
 */
function signJwt(payload: Record<string, unknown>, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${JWT_HEADER}.${body}`)
    .digest('base64url');
  return `${JWT_HEADER}.${body}.${sig}`;
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'VALIDATION_ERROR', message: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { success: false, error: 'VALIDATION_ERROR', message: 'Request body must be a JSON object.' },
      { status: 400 },
    );
  }

  const { email } = body as Record<string, unknown>;

  if (typeof email !== 'string' || !email.trim()) {
    return NextResponse.json(
      { success: false, error: 'VALIDATION_ERROR', message: 'email is required.' },
      { status: 400 },
    );
  }

  const normalizedEmail = email.toLowerCase().trim();

  if (!EMAIL_RE.test(normalizedEmail)) {
    return NextResponse.json(
      { success: false, error: 'VALIDATION_ERROR', message: 'email format is invalid.' },
      { status: 400 },
    );
  }

  // PII-safe hash for logging and JWT subject — never expose the raw email
  const hash = crypto.createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 16);
  const emailDomain = normalizedEmail.split('@')[1];

  registrationCounter.add(1, {
    email_domain: emailDomain,
    environment: process.env.VERCEL_ENV || 'development',
  });

  // Build JWT session token
  const jwtSecret = (process.env.JWT_SECRET ?? '').trim();

  const response = NextResponse.json({
    success: true,
    message: 'Registration successful! Welcome to Apex.',
    timestamp: new Date().toISOString(),
    // Return display name as first part of email domain for the UI
    user: { domain: emailDomain },
  });

  // Issue session cookie when JWT_SECRET is configured.
  // If the secret is absent we still succeed (no cookie issued) so the API
  // is functional even in environments where auth isn't configured yet.
  if (jwtSecret) {
    const token = signJwt(
      {
        sub: hash,
        domain: emailDomain,
        iat: Math.floor(Date.now() / 1000),
        // 7-day expiry
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      },
      jwtSecret,
    );

    response.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });
  }

  return response;
}
