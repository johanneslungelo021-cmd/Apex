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
 *   4. Kimi K2.5 emotion classification of post content
 *   5. Fee multiplier applied based on emotion state
 *   6. SERIALIZABLE transaction insert (retry on SQLSTATE 40001)
 *   7. Treasury split trigger fires automatically
 *
 * Emotion → fee multiplier:
 *   ecstatic → 1.20×  |  bullish → 1.10×
 *   neutral  → 1.00×  |  panicked → 0.85×
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseClient } from '@/lib/supabase';
import { log, generateRequestId } from '@/lib/api-utils';
import { classifyEmotionState, applyEmotionMultiplier } from '@/lib/treasury/emotion-classifier';
import { insertTransactionSerializable } from '@/lib/treasury/serializable-insert';

const SERVICE = 'webhook-outstand';
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
const BASE_PLATFORM_FEE_PCT = 0.05; // 5% base — emotion multiplier adjusts this

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigHex   = signature.replace('sha256=', '');
  const exp = Buffer.from(expected, 'hex');
  const rec = Buffer.from(sigHex, 'hex');
  if (exp.length !== rec.length) return false;
  return crypto.timingSafeEqual(exp, rec);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = generateRequestId();

  const signature = request.headers.get('x-outstand-signature');
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
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  // Idempotency — check webhook_events table
  const { data: existing } = await supabase.from('webhook_events')
    .select('id,processed').eq('source', 'outstand').eq('external_id', external_id).maybeSingle();

  if (existing?.processed) {
    log({ level: 'info', service: SERVICE, message: 'Duplicate webhook — already processed', requestId, external_id });
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Log raw event (idempotency record)
  await supabase.from('webhook_events').upsert({
    source: 'outstand', external_id, event_type: event,
    payload: body as Record<string, unknown>, processed: false,
  }, { onConflict: 'source,external_id', ignoreDuplicates: true });

  try {
    // 1. Classify emotion state using Kimi K2.5
    const kimiKey = process.env.KIMI_API_KEY ?? process.env.MPC_APEX;
    let emotionState: 'ecstatic' | 'bullish' | 'neutral' | 'panicked' = 'neutral';
    let feeMultiplier = 1.00;

    if (kimiKey && post?.text) {
      const classification = await classifyEmotionState(
        { text: post.text, platform: post.platform ?? 'unknown',
          likes: post.likes, shares: post.shares, comments: post.comments },
        kimiKey,
      );
      emotionState  = classification.emotion_state;
      feeMultiplier = classification.fee_multiplier;
      log({
        level: 'info', service: SERVICE, requestId,
        message: `Kimi classified emotion: ${emotionState} (${feeMultiplier}×)`,
        confidence: classification.confidence,
      });
    }

    // 2. Calculate fee with emotion multiplier
    const amountZar   = currency === 'ZAR' ? amount : amount; // TODO: FX conversion for cross-border
    const baseFee     = Math.round(amountZar * BASE_PLATFORM_FEE_PCT * 100) / 100;
    const adjustedFee = applyEmotionMultiplier(baseFee, emotionState);
    const isCrossBorder = currency !== 'ZAR';

    // 3. Serializable insert (retry on SQLSTATE 40001)
    const result = await insertTransactionSerializable({
      creator_id,
      customer_id:          null,  // TODO: resolve customer by KYC when available
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
      source_currency:      currency || 'ZAR',
      destination_currency: 'ZAR',
      source_country:       null,
      destination_country:  'ZA',
      metadata:             { ...metadata, post, fee_multiplier: feeMultiplier, original_currency: currency },
    }, requestId);

    if (!result.success && result.duplicate) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (!result.success) {
      throw new Error(`Transaction insert failed: ${result.error}`);
    }

    // Mark webhook as processed
    await supabase.from('webhook_events').update({ processed: true, processed_at: new Date().toISOString() })
      .eq('source', 'outstand').eq('external_id', external_id);

    log({
      level: 'info', service: SERVICE, requestId,
      message: `Outstand revenue processed — ${emotionState} × ${feeMultiplier}`,
      transactionId: result.data.id, amountZar, adjustedFee, emotionState,
    });

    return NextResponse.json({ received: true, transaction_id: result.data.id, emotion_state: emotionState, fee_multiplier: feeMultiplier });
  } catch (err) {
    log({ level: 'error', service: SERVICE, message: 'Processing failed', requestId, errMsg: String(err) });
    await supabase.from('webhook_events').update({ processing_error: String(err) })
      .eq('source', 'outstand').eq('external_id', external_id);
    return NextResponse.json({ error: 'PROCESSING_FAILED' }, { status: 500 });
  }
}
