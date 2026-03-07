/**
 * Logout Endpoint
 *
 * Clears the session cookie by setting it to an expired value.
 *
 * POST /api/auth/logout
 * Response: { "success": true }
 *
 * @module api/auth/logout
 */

import { NextResponse } from 'next/server';

export async function POST(): Promise<Response> {
  const response = NextResponse.json({ success: true });
  response.cookies.set('session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
