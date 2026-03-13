export const runtime = 'nodejs';

/**
 * Login Endpoint — email + password → JWT session cookie
 *
 * Rate limited to 10 attempts per 15 minutes per IP to prevent brute force.
 *
 * @module api/auth/login
 */

import { NextResponse } from 'next/server';
import { generateRequestId, log, checkRateLimit } from '@/lib/api-utils';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, buildSessionCookie } from '@/lib/auth/session';
import { findUserByEmail, updateLastLogin } from '@/lib/auth/store';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SERVICE = 'auth-login';

// Generic error message — never reveal whether email exists or password was wrong
const INVALID_CREDENTIALS = 'Invalid email or password.';

export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();

  // Rate limit: 10 login attempts per 15 minutes per IP
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
    log({ level: 'warn', service: SERVICE, message: 'Rate limit exceeded', requestId });
    return NextResponse.json(
      { success: false, error: 'RATE_LIMITED', message: 'Too many login attempts. Try again in 15 minutes.' },
      { status: 429, headers: { 'Retry-After': '900' } }
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'VALIDATION_ERROR', message: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { success: false, error: 'VALIDATION_ERROR', message: 'Request body must be a JSON object.' },
      { status: 400 }
    );
  }

  const { email, password } = body as Record<string, unknown>;

  // Validate inputs
  if (typeof email !== 'string' || !EMAIL_RE.test(email.toLowerCase().trim())) {
    return NextResponse.json(
      { success: false, error: 'AUTH_FAILED', message: INVALID_CREDENTIALS },
      { status: 401 }
    );
  }
  if (typeof password !== 'string' || !password) {
    return NextResponse.json(
      { success: false, error: 'AUTH_FAILED', message: INVALID_CREDENTIALS },
      { status: 401 }
    );
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Find user
    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      // Timing-safe: hash a dummy password to prevent email enumeration
      await verifyPassword(password, '$2a$12$invalidhashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      return NextResponse.json(
        { success: false, error: 'AUTH_FAILED', message: INVALID_CREDENTIALS },
        { status: 401 }
      );
    }

    // Verify password
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      log({
        level: 'warn',
        service: SERVICE,
        message: `Failed login for user_${user.id.slice(0, 8)}`,
        requestId,
      });
      return NextResponse.json(
        { success: false, error: 'AUTH_FAILED', message: INVALID_CREDENTIALS },
        { status: 401 }
      );
    }

    // Issue session
    await updateLastLogin(user.id);
    const token = await createSession({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });

    log({
      level: 'info',
      service: SERVICE,
      message: `User logged in: user_${user.id.slice(0, 8)}`,
      requestId,
    });

    const response = NextResponse.json({
      success: true,
      message: `Welcome back, ${user.displayName}!`,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    });
    response.headers.set('Set-Cookie', buildSessionCookie(token));
    return response;

  } catch (error) {
    log({
      level: 'error',
      service: SERVICE,
      message: `Login error: ${error instanceof Error ? error.message : 'Unknown'}`,
      requestId,
    });
    return NextResponse.json(
      { success: false, error: 'INTERNAL_ERROR', message: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}
