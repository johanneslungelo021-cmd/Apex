/**
 * Logout — POST /api/auth/logout
 * Clears the session cookie.
 * 
 * @module api/auth/logout
 */

import { NextResponse } from 'next/server';
import { buildLogoutCookie } from '@/lib/auth/session';

export async function POST(): Promise<Response> {
  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully.',
  });
  response.headers.set('Set-Cookie', buildLogoutCookie());
  return response;
}
