export const runtime = 'nodejs';
/**
 * Outstand Webhook — Phase 2, RICE #1 (Social Revenue Node)
 *
 * Ingests revenue events from Outstand's unified social media API
 * (10+ platforms: Instagram, TikTok, YouTube, Twitter/X, etc.)
 *
 * Pipeline:
 *   1. HMAC-SHA256 signature verification (timing-safe)
 *   2. 5-minute timestamp replay protection
 *   3. Idempotency check (webhook_events table)
 *   4. KYC customer resolution (customers table by id_number)
 *   5. FX conversion to ZAR (live rate → cache → fallback)
 *   6. Kimi K2.5 emotion classification of post content
 *   7. Fee multiplier applied based on emotion state
 *   8. SERIALIZABLE transaction insert (retry on SQLSTATE 40001)
 *   9. Treasury split trigger fires automatically
 *
 * Emotion → fee multiplier:
 *   ecstatic → 1.20×  |  bullish → 1.10×
 *   neutral  → 1.00×  |  panicked → 0.85×
 *
 * APEX protocol: production-grade, every promise caught, no silent failures.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseClient } from '@/lib/supabase';
import { log, generateRequestId } from '@/lib/api-utils';
import { classifyEmotionState, applyEmotionMultiplier } from '@/lib/treasury/emotion-classifier';
import { insertTransactionSerializable } from '@/lib/treasury/serializable-insert';
import { convertToZar } from '@/lib/treasury/fx';

const SERVICE = 'webhook-outstand';
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
const BASE_PLATFORM_FEE_PCT = 0.05; // 5% base — emotion multiplier adjusts this

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigHex   = signature.replace('sha256=', '');
  const exp = Buffer.from(expected, 'hex');
  const rec = Buffer.from(sigHex,   'hex');
  if (exp.length !== rec.length) return false;
  return crypto.timingSafeEqual(exp, rec);
}

// ─── KYC resolution ────────────────────────────────────────────────────────────
// Looks up the customers table by SA ID number if the payload includes one.
// Returns null gracefully — a missing customer never blocks a transaction.

async function resolveCustomerId(
  idNumber: string | undefined,
  requestId: string,
): Promise<string | null> {
  if (!idNumber) return null;
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('customers')
      .select('id')
      .eq('id_number', idNumber)
      .maybeSingle();
    return data?.id ?? null;
  } catch (err) {
    log({ level: 'warn', service: SERVICE, requestId,
      message: `KYC customer lookup failed (non-fatal): ${String(err)}` });
    return null;
  }
}

// ─── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const requestId = generateRequestId();

  const signature      = request.headers.get('x-outstand-signature');
  const timestampHeader = request.headers.get('x-outstand-timestamp');
  if (!signature || !timestampHeader) {
    log({ level: 'warn', service: SERVICE, message: 'Missing auth headers', requestId });
    return NextResponse.json({ error: 'Missing signature or timestamp' }, { status: 401 });
  }

  // Replay protection
  const eventTimestamp = parseInt(timestampHeader, 10);
  if (isNaN(eventTimestamp) || Math.abs(Date.now() - eventTimestamp) > TIMESTAMP_TOLERANCE_MS) {
    log({ level: 'warn', service: SERVICE, message: 'Timestamp outside 5-minute window', requestId });
    return NextResponse.json({ error: 'Request expired' }, { status: 401 });
  }

  const rawBody = await request.text();

  const outstandSecret = process.env.OUTSTAND_WEBHOOK_SECRET;
  if (!outstandSecret) {
    log({ level: 'error', service: SERVICE, message: 'OUTSTAND_WEBHOOK_SECRET not set', requestId });
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  if (!verifySignature(rawBody, signature, outstandSecret)) {
    log({ level: 'warn', service: SERVICE, message: 'Signature verification failed', requestId });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: {
    event: string;
    external_id: string;
    amount: number;
    currency: string;
    creator_id?: string;
    community_impact?: boolean;
    post?: { platform: string; text: string; likes?: number; shares?: number; comments?: number };
    customer?: { id_number?: string };
    metadata?: Record<string, unknown>;
  };

  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event, external_id, amount, currency, creator_id, post, metadata } = body;

  if (!event || !external_id || !amount || !creator_id) {
    return NextResponse.json({ error: 'Missing required fields: event, external_id, amount, creator_id' }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  // Idempotency — check webhook_events table
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id,processed')
    .eq('source', 'outstand')
    .eq('external_id', external_id)
    .maybeSingle();

  if (existing?.processed) {
    log({ level: 'info', service: SERVICE, message: 'Duplicate webhook — already processed', requestId, external_id });
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Log raw event (idempotency record)
  await supabase.from('webhook_events').upsert(
    { source: 'outstand', external_id, event_type: event,
      payload: body as Record<string, unknown>, processed: false },
    { onConflict: 'source,external_id', ignoreDuplicates: true },
  );

  try {
    // ── Step 1: KYC customer resolution ───────────────────────────────────────
    const customerId = await resolveCustomerId(body.customer?.id_number, requestId);
    if (customerId) {
      log({ level: 'info', service: SERVICE, requestId,
        message: `KYC resolved: customer ${customerId}` });
    }

    // ── Step 2: FX conversion to ZAR ──────────────────────────────────────────
    const fx = await convertToZar(amount, currency ?? 'ZAR');
    const amountZar = fx.amount_zar;
    const isCrossBorder = (currency ?? 'ZAR').toUpperCase() !== 'ZAR';

    if (isCrossBorder) {
      log({ level: 'info', service: SERVICE, requestId,
        message: `FX: ${amount} ${currency} → R${amountZar} (${fx.rate_source}, rate ${fx.rate_used})` });
    }

    // ── Step 3: Kimi K2.5 emotion classification ──────────────────────────────
    const kimiKey = process.env.KIMI_API_KEY ?? process.env.MPC_APEX;
    let emotionState: 'ecstatic' | 'bullish' | 'neutral' | 'panicked' = 'neutral';
    let feeMultiplier = 1.00;
    let cacheHit = false;

    if (kimiKey && post?.text) {
      const classification = await classifyEmotionState(
        { text: post.text, platform: post.platform ?? 'unknown',
          likes: post.likes, shares: post.shares, comments: post.comments },
        kimiKey,
      );
      emotionState  = classification.emotion_state;
      feeMultiplier = classification.fee_multiplier;
      cacheHit      = classification.cache_hit ?? false;
      log({ level: 'info', service: SERVICE, requestId,
        message: `Kimi classified: ${emotionState} (${feeMultiplier}×) cache=${cacheHit}`,
        confidence: classification.confidence });
    }

    // ── Step 4: Fee calculation ────────────────────────────────────────────────
    const baseFee     = Math.round(amountZar * BASE_PLATFORM_FEE_PCT * 100) / 100;
    const adjustedFee = applyEmotionMultiplier(baseFee, emotionState);

    // ── Step 5: Serializable insert (retries on SQLSTATE 40001) ───────────────
    const result = await insertTransactionSerializable({
      creator_id,
      customer_id:          customerId,
      amount_zar:           amountZar,
      platform_fee_zar:     adjustedFee,
      gateway:              'manual',
      gateway_ref:          external_id,
      external_id,
      status:               'success',
      type:                 'one_time',
      source_type:          `outstand_${post?.platform ?? 'social'}`,
      community_impact:     body.community_impact === true,
      emotion_state:        emotionState,
      is_cross_border:      isCrossBorder,
      source_currency:      (currency ?? 'ZAR').toUpperCase(),
      destination_currency: 'ZAR',
      source_country:       null,
      destination_country:  'ZA',
      metadata: {
        ...metadata, post,
        fee_multiplier:    feeMultiplier,
        original_currency: currency,
        original_amount:   amount,
        fx_rate:           fx.rate_used,
        fx_source:         fx.rate_source,
        kimi_cache_hit:    cacheHit,
        customer_resolved: customerId !== null,
      },
    }, requestId);

    if (!result.success && result.duplicate) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (!result.success) {
      throw new Error(`Transaction insert failed: ${result.error}`);
    }

    // Mark webhook as processed
    await supabase.from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('source', 'outstand')
      .eq('external_id', external_id);

    log({ level: 'info', service: SERVICE, requestId,
      message: `Outstand revenue processed — ${emotionState} × ${feeMultiplier}`,
      transactionId: result.data.id, amountZar, adjustedFee, emotionState,
      isCrossBorder, fxSource: fx.rate_source, customerResolved: customerId !== null });

    return NextResponse.json({
      received:         true,
      transaction_id:   result.data.id,
      emotion_state:    emotionState,
      fee_multiplier:   feeMultiplier,
      amount_zar:       amountZar,
      fx_rate:          fx.rate_used,
      fx_source:        fx.rate_source,
      customer_id:      customerId,
    });

  } catch (err) {
    log({ level: 'error', service: SERVICE, message: 'Processing failed', requestId, errMsg: String(err) });
    await supabase.from('webhook_events')
      .update({ processing_error: String(err) })
      .eq('source', 'outstand')
      .eq('external_id', external_id);
    return NextResponse.json({ error: 'PROCESSING_FAILED' }, { status: 500 });
  }
}
