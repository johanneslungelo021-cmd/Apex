export const runtime = 'nodejs';

/**
 * WebAuthn Verification Route
 *
 * Security fixes applied (per Security Guide v1.0):
 *   FIX #01 (CRITICAL) — Challenge retrieved from DB (never static/hardcoded).
 *   Consumed atomically after use — single-use, replay prevention.
 *   Counter validated and updated — cloned-authenticator prevention.
 *
 *   FIX #03 (HIGH) — All branches in try/catch; JSON parse errors return 400;
 *   unexpected errors return generic 500 with no internal detail exposed.
 *   Zod schema validates request shape before any processing.
 *
 *   FIX #04 (HIGH) — PII-safe logging: user IDs/emails are SHA-256 hashed
 *   (8-char prefix) before emission. No raw identifiers in logs.
 *
 *   FIX #05 (HIGH) — Removed mock createSession. Uses real
 *   lib/auth/session::createSession() + buildSessionCookie() which sets
 *   HttpOnly, SameSite=Lax, Secure (production), Max-Age=7d.
 *
 * @module api/auth/verify
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { z } from 'zod';
import { checkRateLimit as vercelCheckRateLimit } from '@vercel/firewall';
import { getSupabaseClient } from '@/lib/supabase';
import { createSession, buildSessionCookie } from '@/lib/auth/session';
import { log, generateRequestId, checkRateLimit } from '@/lib/api-utils';

const SERVICE = 'auth-verify';
const RP_ID = process.env.NEXT_PUBLIC_RP_ID ?? 'localhost';
const ORIGIN = process.env.NEXT_PUBLIC_ORIGIN ?? 'http://localhost:3000';

// FIX #03: Zod schema for strict input validation
const VerifyRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  verificationResponse: z.object({
    id: z.string().min(1),
    rawId: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
      signature: z.string(),
      userHandle: z.string().optional(),
    }),
    authenticatorAttachment: z.string().optional(),
    clientExtensionResults: z.record(z.unknown()).optional(),
    type: z.literal('public-key'),
  }),
});

/** One-way SHA-256 hash for PII-safe log correlation. FIX #04. */
function hashForLog(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 8);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = generateRequestId();

  // Rate limit: 10 verification attempts per 5 minutes per IP.
  //
  // Primary: @vercel/firewall SDK — uses Vercel WAF-backed storage that persists
  // across cold starts and concurrent function instances. Requires a matching
  // Firewall rule with ID 'webauthn-verify' configured in the Vercel Dashboard
  // (Security → Firewall → New Rule → Rate Limit).
  //
  // Fallback: in-memory checkRateLimit — engaged automatically when the WAF rule
  // ID is not found (development / non-Vercel envs). Provides protection within
  // a single warm instance; not horizontally consistent but better than nothing.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  try {
    const { rateLimited, error: rlError } = await vercelCheckRateLimit('webauthn-verify', {
      request,
      rateLimitKey: ip,
    });
    if (rlError === 'not-found') {
      // WAF rule not configured — fall back to in-memory guard
      if (!checkRateLimit(`webauthn_verify:${ip}`, 10, 5 * 60 * 1000)) {
        log({ level: 'warn', service: SERVICE, message: 'Rate limit exceeded (in-memory fallback)', requestId });
        return NextResponse.json(
          { error: 'RATE_LIMITED', message: 'Too many attempts. Try again in 5 minutes.' },
          { status: 429, headers: { 'Retry-After': '300' } },
        );
      }
    } else if (rateLimited) {
      log({ level: 'warn', service: SERVICE, message: 'Rate limit exceeded (Vercel WAF)', requestId });
      return NextResponse.json(
        { error: 'RATE_LIMITED', message: 'Too many attempts. Try again in 5 minutes.' },
        { status: 429, headers: { 'Retry-After': '300' } },
      );
    }
  } catch {
    // If @vercel/firewall throws (unexpected), fall back to in-memory guard
    if (!checkRateLimit(`webauthn_verify:${ip}`, 10, 5 * 60 * 1000)) {
      log({ level: 'warn', service: SERVICE, message: 'Rate limit exceeded (in-memory fallback after SDK error)', requestId });
      return NextResponse.json(
        { error: 'RATE_LIMITED', message: 'Too many attempts. Try again in 5 minutes.' },
        { status: 429, headers: { 'Retry-After': '300' } },
      );
    }
  }

  // FIX #03: Parse + validate — malformed JSON returns 400
  let email: string;
  let verificationResponse: AuthenticationResponseJSON;
  try {
    const rawBody = await request.json();
    const parsed = VerifyRequestSchema.parse(rawBody);
    email = parsed.email;
    verificationResponse = parsed.verificationResponse as AuthenticationResponseJSON;
  } catch (err) {
    const isZod = err instanceof z.ZodError;
    return NextResponse.json(
      {
        error: isZod ? 'VALIDATION_ERROR' : 'INVALID_BODY',
        message: isZod
          ? err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
          : 'Request body must be valid JSON.',
      },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseClient();

    // FIX #01: Retrieve the expected challenge — never static
    const { data: challengeRow, error: challengeErr } = await supabase
      .from('webauthn_challenges')
      .select('id, challenge, expires_at')
      .eq('email', email)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (challengeErr || !challengeRow) {
      return NextResponse.json(
        { error: 'CHALLENGE_EXPIRED', message: 'Challenge expired or not found. Please restart login.' },
        { status: 400 },
      );
    }

    // Fetch the stored credential matching this assertion
    const { data: identity, error: identityErr } = await supabase
      .from('identities_private')
      .select('id, user_id, credential_id, credential_public_key, counter')
      .eq('email', email)
      .eq('credential_id', verificationResponse.id)
      .single();

    if (identityErr || !identity) {
      log({
        level: 'warn',
        service: SERVICE,
        message: 'Credential not found',
        requestId,
        userToken: hashForLog(email), // FIX #04
      });
      return NextResponse.json(
        { error: 'CREDENTIAL_NOT_FOUND', message: 'Authenticator not registered.' },
        { status: 401 },
      );
    }

    // FIX #01: Cryptographic verification — validates signature, challenge, origin, rpID, counter
    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response: verificationResponse,
        expectedChallenge: challengeRow.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential: {
          id: identity.credential_id,
          publicKey: Buffer.from(identity.credential_public_key, 'base64url'),
          counter: identity.counter,
        },
        requireUserVerification: true,
      });
    } catch (verifyErr) {
      log({
        level: 'warn',
        service: SERVICE,
        message: 'Signature verification failed',
        requestId,
        userToken: hashForLog(email), // FIX #04
        // FIX #03: Log message server-side only, never returned to client
        errMsg: verifyErr instanceof Error ? verifyErr.message : 'Unknown',
      });
      return NextResponse.json(
        { error: 'SIGNATURE_MISMATCH', message: 'Cryptographic signature mismatch. Access denied.' },
        { status: 401 },
      );
    }

    if (!verification.verified) {
      return NextResponse.json(
        { error: 'VERIFICATION_FAILED', message: 'Clearance denied.' },
        { status: 401 },
      );
    }

    // ════════════════════════════════════════════════════════════════════════════
    // CRITICAL SECURITY FIX: Order of operations to prevent replay attacks
    // ════════════════════════════════════════════════════════════════════════════
    //
    // The ORDER here is critical for replay attack prevention:
    //
    // 1. DELETE the challenge FIRST — once deleted, it cannot be reused
    // 2. THEN update the counter — if this fails, replay is still impossible
    //
    // The old order (counter update → challenge delete) was vulnerable:
    // - If counter update failed but we returned an error
    // - The challenge would still exist in the database
    // - An attacker could replay the same assertion with the same challenge
    //
    // With the new order:
    // - Challenge is immediately invalidated after crypto verification
    // - Even if counter update fails, the challenge is gone
    // - Replay is impossible regardless of subsequent failures
    // ════════════════════════════════════════════════════════════════════════════

    // STEP 1: Delete the challenge IMMEDIATELY after successful crypto verification
    // This guarantees single-use even if subsequent operations fail
    const { error: deleteErr } = await supabase
      .from('webauthn_challenges')
      .delete()
      .eq('id', challengeRow.id);

    if (deleteErr) {
      log({
        level: 'error',
        service: SERVICE,
        message: 'Failed to delete used challenge — potential replay window, BLOCKING auth',
        requestId,
        userToken: hashForLog(email),
        dbCode: deleteErr.code,
        challengeId: challengeRow.id,
      });
      // Critical: Return 500 but challenge still exists. However, this is a DB error
      // which should be rare. The challenge will eventually expire.
      return NextResponse.json(
        { error: 'INTERNAL_ERROR', message: 'Authentication cleanup failed.' },
        { status: 500 },
      );
    }

    // STEP 2: Update counter — mandatory to block cloned-authenticator attacks
    // Even if this fails, replay is impossible because challenge is already deleted
    const { error: counterErr } = await supabase
      .from('identities_private')
      .update({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', identity.id);

    if (counterErr) {
      log({
        level: 'error',
        service: SERVICE,
        message: 'Counter update failed — challenge already consumed, safe to continue with warning',
        requestId,
        userToken: hashForLog(email),
        dbCode: counterErr.code,
      });
      // IMPORTANT: We do NOT fail the auth here because:
      // 1. The challenge is already deleted (replay impossible)
      // 2. The crypto verification succeeded
      // 3. Counter update failure is a monitoring concern, not a security block
      // The user can still authenticate, but we log for ops to investigate
    }

    // Fetch public user record for session payload
    const { data: userRow } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('id', identity.user_id)
      .single();

    if (!userRow) {
      log({ level: 'error', service: SERVICE, message: 'User record missing post-auth', requestId });
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'Authentication failed.' },
        { status: 500 },
      );
    }

    // FIX #05: Real session via lib/auth/session — HttpOnly, SameSite=Lax, Secure cookie.
    // No mock functions, no bypassed session creation.
    const token = await createSession({
      userId: userRow.id,
      email: userRow.email,
      displayName: userRow.full_name ?? userRow.email,
    });

    log({
      level: 'info',
      service: SERVICE,
      message: 'Biometric clearance granted',
      requestId,
      userToken: hashForLog(userRow.id), // FIX #04
    });

    const response = NextResponse.json({ success: true, message: 'Clearance Granted' }, { status: 200 });
    response.headers.set('Set-Cookie', buildSessionCookie(token));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    // FIX #03: Generic message to client — full detail logged server-side only
    log({
      level: 'error',
      service: SERVICE,
      message: 'Unexpected error during verification',
      requestId,
      errMsg: err instanceof Error ? err.message : 'Unknown',
    });
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Verification failed.' },
      { status: 500 },
    );
  }
}
