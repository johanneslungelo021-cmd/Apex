export const runtime = 'nodejs';

/**
 * Paystack Treasury Webhook
 *
 * Security fixes applied (per Security Guide v1.0):
 *   FIX #02 (CRITICAL) — Full HMAC SHA-512 signature verification via
 *   crypto.timingSafeEqual() before any payload processing. Requests without
 *   a valid x-paystack-signature are rejected with 401 immediately.
 *
 *   FIX #02 (CRITICAL) — Raw body read with req.text() BEFORE JSON parsing.
 *   The HMAC is computed against raw bytes — parsing JSON first invalidates
 *   the signature and creates a body-substitution attack vector.
 *
 *   FIX #03 (HIGH) — Full try/catch on JSON parsing and DB operations.
 *   Structured payload validation before accessing nested fields.
 *   data.reference is the correct Paystack field (not data.external_id).
 *
 *   FIX #04 (HIGH) — PII-safe logging: creator IDs SHA-256 hashed.
 *
 * Idempotency: external_id (Paystack reference) has a UNIQUE constraint in
 * the transactions table — duplicate webhooks are silently absorbed (409 → 200).
 *
 * Treasury trigger: The Supabase trigger process_treasury_split fires
 * automatically on status='success' INSERT, splitting funds into the
 * vaal_development_pool and updating creator.total_earnings.
 *
 * @module api/webhooks/paystack
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseClient } from '@/lib/supabase';
import { log, generateRequestId } from '@/lib/api-utils';

const SERVICE = 'webhook-paystack';

/** One-way SHA-256 hash for PII-safe log correlation. FIX #04. */
function hashForLog(value: string): string {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 8);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = generateRequestId();

  // ── FIX #02: Signature check ────────────────────────────────────────────────
  const signature = request.headers.get('x-paystack-signature');
  if (!signature) {
    log({ level: 'warn', service: SERVICE, message: 'Missing x-paystack-signature header', requestId });
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
  }

  // MUST read raw body with .text() BEFORE any JSON parsing.
  // The HMAC is computed over raw bytes — JSON.parse() would modify the body.
  const rawBody = await request.text();

  // FIX: Runtime guard — non-null assertion (!) crashes the entire route before
  // the try/catch can even log the failure if the env var is missing in Vercel.
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSecret) {
    log({
      level: 'error',
      service: SERVICE,
      message: 'PAYSTACK_SECRET_KEY is not set in environment — treasury bridge offline',
      requestId,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  // Compute expected HMAC SHA-512
  const expectedHash = crypto
    .createHmac('sha512', paystackSecret)
    .update(rawBody)
    .digest('hex');

  // FIX #02: timingSafeEqual prevents timing oracle attacks
  let signatureValid = false;
  try {
    signatureValid = crypto.timingSafeEqual(
      Buffer.from(expectedHash, 'hex'),
      Buffer.from(signature, 'hex'),
    );
  } catch {
    // Buffer length mismatch (malformed signature) — treat as invalid
    signatureValid = false;
  }

  if (!signatureValid) {
    log({ level: 'warn', service: SERVICE, message: 'Invalid Paystack signature — potential forgery', requestId });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // ── FIX #03: Structured payload validation ───────────────────────────────────
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    log({ level: 'warn', service: SERVICE, message: 'Malformed JSON in webhook body', requestId });
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate event type field exists and is a string
  if (!event.event || typeof event.event !== 'string') {
    return NextResponse.json({ error: 'Invalid event structure' }, { status: 400 });
  }

  // Acknowledge non-charge events without processing (idempotent 200)
  if (event.event !== 'charge.success') {
    log({ level: 'info', service: SERVICE, message: `Ignored event: ${event.event}`, requestId });
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Validate data object
  if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) {
    return NextResponse.json({ error: 'Missing event data' }, { status: 400 });
  }

  const data = event.data as Record<string, unknown>;

  // FIX #03: data.reference is the correct Paystack field — NOT data.external_id
  const reference = data.reference;
  if (!reference || typeof reference !== 'string') {
    log({ level: 'warn', service: SERVICE, message: 'Missing data.reference in charge.success', requestId });
    return NextResponse.json({ error: 'Missing payment reference' }, { status: 400 });
  }

  // Extract metadata sent during payment initialization
  const metadata = (data.metadata as Record<string, unknown>) ?? {};
  const creatorId = metadata.creator_id;
  const amountKobo = data.amount;

  if (!creatorId || typeof creatorId !== 'string') {
    log({ level: 'warn', service: SERVICE, message: 'Missing metadata.creator_id', requestId });
    return NextResponse.json({ error: 'Missing creator_id in metadata' }, { status: 400 });
  }

  if (typeof amountKobo !== 'number' || amountKobo <= 0) {
    log({ level: 'warn', service: SERVICE, message: 'Invalid amount in webhook payload', requestId });
    return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 });
  }

  // ── Insert into immutable ledger ──────────────────────────────────────────────
  try {
    const supabaseAdmin = getSupabaseClient(); // Service role — bypasses RLS
    // Paystack sends all monetary amounts in the smallest currency unit
    // (kobo for NGN, cents for ZAR). Divide by 100 to convert to the major unit
    // (rand). amountZar here represents the full rand value of the transaction.
    const amountZar = amountKobo / 100;

    const platformFeePct = 0.05; // 5% platform fee
    const platformFeeZar = parseFloat((amountZar * platformFeePct).toFixed(2));

    // Derive both `type` and `source_type` from a single normalised value with an
    // explicit default. Previously normalizedSource could be undefined, causing
    // type to fall back via ternary ('subscription') while source_type fell back
    // via nullish-coalescing ('standard_subscription') — logically consistent but
    // the relationship was invisible. Now both fields derive from one variable.
    const normalizedSource = typeof metadata.source_type === 'string'
      ? metadata.source_type
      : 'standard_subscription';

    const { error: dbError } = await supabaseAdmin.from('transactions').insert({
      creator_id: creatorId,
      amount_zar: amountZar,
      platform_fee_zar: platformFeeZar,
      gateway: 'paystack',
      gateway_ref: reference, // Paystack unique reference
      external_id: reference, // UNIQUE constraint — idempotency key
      status: 'success',
      type: normalizedSource === 'one_time' ? 'one_time' : 'subscription',
      source_type: normalizedSource,
      community_impact: metadata.community_impact === true || metadata.community_impact === 'true',
      emotion_state: 'neutral',
      metadata: data, // Store full Paystack payload for audit
    });

    if (dbError) {
      // Code 23505 = unique_violation — duplicate webhook, already processed
      if (dbError.code === '23505') {
        log({
          level: 'info',
          service: SERVICE,
          message: 'Duplicate webhook — already processed',
          requestId,
          ref: hashForLog(reference), // FIX #04
        });
        return NextResponse.json({ received: true, status: 'already_processed' }, { status: 200 });
      }
      log({
        level: 'error',
        service: SERVICE,
        message: 'Ledger insert failed',
        requestId,
        creatorToken: hashForLog(creatorId), // FIX #04
        dbCode: dbError.code,
      });
      return NextResponse.json({ error: 'Ledger write failure' }, { status: 500 });
    }

    log({
      level: 'info',
      service: SERVICE,
      message: 'Sovereign Treasury updated',
      requestId,
      creatorToken: hashForLog(creatorId), // FIX #04
      amountZar,
    });

    // Treasury split trigger fires automatically via Supabase trigger
    return NextResponse.json({ status: 'Sovereign Treasury Updated' }, { status: 200 });
  } catch (err) {
    // FIX #03: Never expose internal error detail to caller
    log({
      level: 'error',
      service: SERVICE,
      message: 'Unexpected webhook processing error',
      requestId,
      errMsg: err instanceof Error ? err.message : 'Unknown',
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
