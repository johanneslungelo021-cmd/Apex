export const runtime = 'nodejs';

/**
 * Session Validation — GET /api/auth/me
 *
 * Reads the HttpOnly session cookie, verifies the JWT,
 * and returns the current user. Used by the client to
 * check if a user is logged in on page load.
 *
 * @module api/auth/me
 */

import { NextResponse } from 'next/server';
import { log } from '@/lib/api-utils';
import { getTokenFromRequest, verifySession } from '@/lib/auth/session';
import { findUserById, type StoredUser } from '@/lib/auth/store';

const SERVICE = 'auth-me';

export async function GET(req: Request): Promise<Response> {
  const token = getTokenFromRequest(req);

  if (!token) {
    return NextResponse.json(
      { authenticated: false, user: null },
      { status: 200 }
    );
  }

  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json(
      { authenticated: false, user: null },
      { status: 200 }
    );
  }

 feat/supabase-auth-persistence
  // Verify user still exists in store
  const user = await findUserById(session.userId);

  // findUserById is now async Supabase I/O — wrap in try/catch so a transient
  // DB/network error returns a stable JSON response instead of an opaque 500.
  let user: StoredUser | null;
  try {
    user = await findUserById(session.userId);
  } catch (err) {
    log({
      level: 'error',
      service: SERVICE,
      message: `Supabase lookup failed: ${err instanceof Error ? err.message : 'Unknown'}`,
    });
    return NextResponse.json(
      { error: 'service_unavailable', message: 'Auth service temporarily unavailable.' },
      { status: 503 }
    );
  }

 main
  if (!user) {
    return NextResponse.json(
      { authenticated: false, user: null },
      { status: 200 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      province: user.province,
      createdAt: user.createdAt,
    },
  });
}
