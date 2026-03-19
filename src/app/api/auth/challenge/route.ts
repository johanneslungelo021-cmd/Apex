export const runtime = 'nodejs';

/**
 * WebAuthn Challenge Route
 *
 * Security fixes applied (per Security Guide v1.0):
 *   FIX #01 (CRITICAL) — Replaced static 'mock-challenge' with cryptographically
 *   random challenge via generateAuthenticationOptions (internally calls
 *   randomBytes(32), satisfying W3C WebAuthn ≥16 byte entropy requirement).
 *
 *   FIX #03 (HIGH) — All branches wrapped in try/catch; malformed JSON returns
 *   400, internal errors return 500 with generic message only (no stack traces).
 *
 *   FIX #04 (HIGH) — PII-safe logging: email is SHA-256 hashed (8-char prefix)
 *   before emission. Raw identifiers never appear in logs.
 *
 * Challenge storage: persisted server-side in webauthn_challenges table with
 * a 2-minute DB-enforced TTL. Consumed (deleted) atomically after verification,
 * guaranteeing single-use and preventing replay attacks.
 *
 * @module api/auth/challenge
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { z } from 'zod';
import { getSupabaseClient } from '@/lib/supabase';
import { log, generateRequestId, checkRateLimit } from '@/lib/api-utils';

const SERVICE = 'auth-challenge';
const RP_ID = process.env.NEXT_PUBLIC_RP_ID ?? 'localhost';

// Zod schema — FIX #03: typed input validation on every request
const ChallengeRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email format'),
});

/** One-way SHA-256 hash for PII-safe log correlation. FIX #04. */
function hashForLog(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 8);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = generateRequestId();

  // Rate limit: 20 challenge requests per 5 minutes per IP
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(`webauthn_challenge:${ip}`, 20, 5 * 60 * 1000)) {
    log({ level: 'warn', service: SERVICE, message: 'Rate limit exceeded', requestId });
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Too many requests. Try again in 5 minutes.' },
      { status: 429, headers: { 'Retry-After': '300' } },
    );
  }

  // FIX #03: Parse + validate input — malformed JSON returns 400, never 500
  let email: string;
  try {
    const rawBody = await request.json();
    const parsed = ChallengeRequestSchema.parse(rawBody);
    email = parsed.email;
  } catch (err) {
    const isZod = err instanceof z.ZodError;
    return NextResponse.json(
      {
        error: isZod ? 'VALIDATION_ERROR' : 'INVALID_BODY',
        message: isZod ? err.errors[0]?.message : 'Request body must be valid JSON with an email field.',
      },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseClient();

    // Fetch the user's registered passkey credentials from the secure server-only table
    const { data: userAuths, error: fetchError } = await supabase
      .from('identities_private')
      .select('credential_id, transports')
      .eq('email', email);

    if (fetchError) {
      log({
        level: 'error',
        service: SERVICE,
        message: 'DB fetch error',
        requestId,
        userToken: hashForLog(email), // FIX #04: hashed, not raw
        dbCode: fetchError.code,
      });
      return NextResponse.json(
        { error: 'DB_ERROR', message: 'Failed to retrieve identity.' },
        { status: 500 },
      );
    }

    if (!userAuths || userAuths.length === 0) {
      // 404 = no passkey registered; client should fall back to password login
      return NextResponse.json(
        { error: 'IDENTITY_NOT_FOUND', message: 'No passkey registered for this account.' },
        { status: 404 },
      );
    }

    // FIX #01 (CRITICAL): generateAuthenticationOptions calls crypto.randomBytes(32)
    // internally — W3C WebAuthn Level 2 compliant. Replaces 'mock-challenge'.
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: userAuths.map((auth) => ({
        id: auth.credential_id,
        transports: (auth.transports ?? []) as AuthenticatorTransportFuture[],
      })),
      userVerification: 'required',
      timeout: 120_000, // 2 minutes
    });

    // Store challenge server-side — 2-minute TTL enforced by DB column default
    const { error: insertError } = await supabase
      .from('webauthn_challenges')
      .insert({ email, challenge: options.challenge });

    if (insertError) {
      log({
        level: 'error',
        service: SERVICE,
        message: 'Challenge store failed',
        requestId,
        dbCode: insertError.code,
      });
      return NextResponse.json(
        { error: 'CHALLENGE_STORE_FAILED', message: 'Failed to issue challenge.' },
        { status: 500 },
      );
    }

    // .catch() prevents an unhandled promise rejection if the RPC fails —
    // purging is non-critical maintenance, never worth crashing the request.
    void Promise.resolve(supabase.rpc('purge_expired_webauthn_challenges')).catch(() => null);

    log({
      level: 'info',
      service: SERVICE,
      message: 'Challenge issued',
      requestId,
      userToken: hashForLog(email), // FIX #04: hashed
    });

    return NextResponse.json(options, { status: 200 });
  } catch (err) {
    // FIX #03: Never expose internal error detail to client
    log({
      level: 'error',
      service: SERVICE,
      message: 'Unexpected error',
      requestId,
      errMsg: err instanceof Error ? err.message : 'Unknown',
    });
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Challenge generation failed.' },
      { status: 500 },
    );
  }
}
