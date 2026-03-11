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
import { getTokenFromRequest, verifySession } from '@/lib/auth/session';
import { findUserById } from '@/lib/auth/store';

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

  // Verify user still exists in store
  const user = findUserById(session.userId);
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
