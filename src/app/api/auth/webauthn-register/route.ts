export const runtime = 'nodejs';

/**
 * WebAuthn Passkey Registration Route
 *
 * Security fixes applied (per Security Guide v1.0):
 *   FIX #01 (CRITICAL) — generateRegistrationOptions uses internal randomBytes(32).
 *   Attestation verification is fail-closed: credential ONLY persisted after
 *   verifyRegistrationResponse passes — never before.
 *
 *   FIX #03 (HIGH) — Zod schema validation; all branches in try/catch.
 *   Malformed JSON returns 400; internal errors return generic 500.
 *
 *   FIX #04 (HIGH) — PII-safe logging via SHA-256 hashing.
 *
 *   FIX #05 (HIGH) — Requires real authenticated session (getTokenFromRequest +
 *   verifySession) before any registration is allowed. No mocks.
 *
 * Flow:
 *   GET  → generates registration options (challenge + RP config)
 *   POST → verifies attestation and persists credential (fail-closed)
 *
 * @module api/auth/webauthn-register
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { RegistrationResponseJSON, AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { z } from 'zod';
import { getSupabaseClient } from '@/lib/supabase';
import { getTokenFromRequest, verifySession } from '@/lib/auth/session';
import { log, generateRequestId } from '@/lib/api-utils';

const SERVICE = 'auth-webauthn-register';
const RP_ID = process.env.NEXT_PUBLIC_RP_ID ?? 'localhost';
const RP_NAME = process.env.NEXT_PUBLIC_RP_NAME ?? 'Apex Sovereign';
const ORIGIN = process.env.NEXT_PUBLIC_ORIGIN ?? 'http://localhost:3000';

// FIX #03: Zod schema for POST body
const RegisterPostSchema = z.object({
  registrationResponse: z.object({
    id: z.string().min(1),
    rawId: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      attestationObject: z.string(),
      transports: z.array(z.string()).optional(),
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

/** FIX #05: Resolve real session from cookie — rejects mocks or missing tokens. */
async function requireSession(request: Request) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifySession(token);
}

// ─── GET — generate registration options ─────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  const requestId = generateRequestId();

  // FIX #05: Real session required
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Session required.' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseClient();

    // Exclude existing credentials for this user — prevents double-registration
    const { data: existing } = await supabase
      .from('identities_private')
      .select('credential_id, transports')
      .eq('user_id', session.userId);

    // FIX #01: generateRegistrationOptions calls randomBytes(32) internally
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new TextEncoder().encode(session.userId),
      userName: session.email,
      userDisplayName: session.displayName ?? session.email,
      timeout: 120_000,
      attestationType: 'none',
      excludeCredentials: (existing ?? []).map((c) => ({
        id: c.credential_id,
        transports: (c.transports ?? []) as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
    });

    // Store challenge server-side with DB TTL — halt if insert fails.
    // Silently swallowing this error would mean every subsequent verify attempt
    // is rejected (no matching challenge), locking the user out with no explanation.
    const { error: challengeInsertErr } = await supabase
      .from('webauthn_challenges')
      .insert({ email: session.email, challenge: options.challenge });

    if (challengeInsertErr) {
      log({
        level: 'error',
        service: SERVICE,
        message: 'Challenge store failed',
        requestId,
        userToken: hashForLog(session.userId),
        dbCode: challengeInsertErr.code,
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
      message: 'Registration options issued',
      requestId,
      userToken: hashForLog(session.userId), // FIX #04
    });

    return NextResponse.json(options, { status: 200 });
  } catch (err) {
    // FIX #03: Generic 500 — no internals exposed
    log({
      level: 'error',
      service: SERVICE,
      message: 'Options generation failed',
      requestId,
      errMsg: err instanceof Error ? err.message : 'Unknown',
    });
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to generate registration options.' },
      { status: 500 },
    );
  }
}

// ─── POST — verify attestation and persist credential ────────────────────────

export async function POST(request: Request): Promise<Response> {
  const requestId = generateRequestId();

  // FIX #05: Real session required
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Session required.' }, { status: 401 });
  }

  // FIX #03: Parse + validate
  let registrationResponse: RegistrationResponseJSON;
  try {
    const rawBody = await request.json();
    const parsed = RegisterPostSchema.parse(rawBody);
    registrationResponse = parsed.registrationResponse as RegistrationResponseJSON;
  } catch (err) {
    const isZod = err instanceof z.ZodError;
    return NextResponse.json(
      {
        error: isZod ? 'VALIDATION_ERROR' : 'INVALID_BODY',
        message: isZod ? err.errors[0]?.message : 'registrationResponse is required.',
      },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseClient();

    // Retrieve expected challenge
    const { data: challengeRow } = await supabase
      .from('webauthn_challenges')
      .select('id, challenge')
      .eq('email', session.email)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!challengeRow) {
      return NextResponse.json(
        { error: 'CHALLENGE_EXPIRED', message: 'Challenge expired. Please retry.' },
        { status: 400 },
      );
    }

    // FIX #01: Verify attestation — FAIL-CLOSED
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response: registrationResponse,
        expectedChallenge: challengeRow.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: true,
      });
    } catch (verifyErr) {
      log({
        level: 'warn',
        service: SERVICE,
        message: 'Attestation verification threw',
        requestId,
        userToken: hashForLog(session.userId), // FIX #04
        errMsg: verifyErr instanceof Error ? verifyErr.message : 'Unknown',
      });
      // FIX #03: 403 (not 500) — attestion failure is a client-side/device error
      return NextResponse.json({ error: 'ATTESTATION_FAILED', message: 'Device verification failed.' }, { status: 403 });
    }

    // FIX #01: Fail-closed — reject unless both flags true
    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'REGISTRATION_FAILED', message: 'Registration not verified.' }, { status: 403 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    // Persist credential ONLY after attestation passes — never before
    const { error: insertError } = await supabase.from('identities_private').insert({
      user_id: session.userId,
      email: session.email,
      credential_id: credential.id,
      credential_public_key: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: registrationResponse.response.transports ?? [],
      device_type: credentialDeviceType,
      backed_up: credentialBackedUp,
      registered_at: new Date().toISOString(),
    });

    if (insertError) {
      log({ level: 'error', service: SERVICE, message: 'Credential insert failed', requestId, dbCode: insertError.code });
      return NextResponse.json({ error: 'DB_ERROR', message: 'Failed to register passkey.' }, { status: 500 });
    }

    // Consume challenge — single-use guarantee.
    // Must check the error: credential is already persisted above; if delete fails,
    // the challenge stays live and the same attestation could be replayed to insert
    // a duplicate credential during the TTL window. Mirror verify/route.ts pattern.
    const { error: deleteErr } = await supabase
      .from('webauthn_challenges')
      .delete()
      .eq('id', challengeRow.id);

    if (deleteErr) {
      log({
        level: 'error',
        service: SERVICE,
        message: 'Failed to delete used challenge — potential replay window in registration',
        requestId,
        userToken: hashForLog(session.userId),
        dbCode: deleteErr.code,
        challengeId: challengeRow.id,
      });
      return NextResponse.json(
        { error: 'INTERNAL_ERROR', message: 'Registration cleanup failed.' },
        { status: 500 },
      );
    }

    log({
      level: 'info',
      service: SERVICE,
      message: 'Passkey registered',
      requestId,
      userToken: hashForLog(session.userId), // FIX #04
    });

    return NextResponse.json({ success: true, message: 'Passkey registered. Biometric login is now active.' }, { status: 201 });
  } catch (err) {
    // FIX #03: Generic message to client
    log({
      level: 'error',
      service: SERVICE,
      message: 'Unexpected error',
      requestId,
      errMsg: err instanceof Error ? err.message : 'Unknown',
    });
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Registration failed.' }, { status: 500 });
  }
}
