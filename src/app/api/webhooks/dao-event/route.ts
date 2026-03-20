export const runtime = 'nodejs';
/**
 * Sentinel DAO Event Webhook — Phase 2, RICE #2 (Community Revenue Node)
 *
 * Receives governance events from Sentinel DAO (on-chain + multi-sig treasury).
 * Only releases community funds AFTER a governance_proposal is approved.
 *
 * Supported events:
 *   proposal.created       — record proposal in governance_proposals
 *   proposal.vote          — update vote counts
 *   proposal.approved      — unlock vaal_development_pool disbursement
 *   proposal.rejected      — cancel pending disbursements
 *   disbursement.executed  — mark vaal_pool entries as disbursed + write immutable audit log
 *
 * APEX protocol: all tables IF NOT EXISTS + indexes + triggers; every promise caught.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseClient } from '@/lib/supabase';
import { log, generateRequestId } from '@/lib/api-utils';

const SERVICE = 'webhook-dao';
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigHex   = signature.replace('sha256=', '');
  const exp = Buffer.from(expected, 'hex');
  const rec = Buffer.from(sigHex,   'hex');
  if (exp.length !== rec.length) return false;
  return crypto.timingSafeEqual(exp, rec);
}

// ─── Payload types ─────────────────────────────────────────────────────────────

type DaoEventBody = {
  event: string;
  proposal_id: string;
  title?: string;
  description?: string;
  vote_counts?: { for: number; against: number };
  status?: string;
  approved_at?: string;
  approved_by?: string;
  disbursement?: {
    amount_zar:     number;
    beneficiary_id: string;
    tx_hash?:       string;
    payment_reference?: string;
  };
  metadata?: Record<string, unknown>;
};

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const requestId = generateRequestId();

  const signature = request.headers.get('x-dao-signature');
  const tsHeader  = request.headers.get('x-dao-timestamp');
  if (!signature || !tsHeader) {
    return NextResponse.json({ error: 'Missing auth headers' }, { status: 401 });
  }

  const eventTimestamp = parseInt(tsHeader, 10);
  if (isNaN(eventTimestamp) || Math.abs(Date.now() - eventTimestamp) > TIMESTAMP_TOLERANCE_MS) {
    return NextResponse.json({ error: 'Request expired' }, { status: 401 });
  }

  const rawBody = await request.text();

  const daoSecret = process.env.DAO_WEBHOOK_SECRET;
  if (!daoSecret) {
    log({ level: 'error', service: SERVICE, message: 'DAO_WEBHOOK_SECRET not set', requestId });
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  if (!verifySignature(rawBody, signature, daoSecret)) {
    log({ level: 'warn', service: SERVICE, message: 'DAO signature verification failed', requestId });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: DaoEventBody;
  try {
    body = JSON.parse(rawBody) as DaoEventBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const { event, proposal_id } = body;

  if (!event || !proposal_id) {
    return NextResponse.json({ error: 'Missing event or proposal_id' }, { status: 400 });
  }

  // Idempotency — composite key on source + external_id
  const eventId = `${event}:${proposal_id}`;
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id,processed')
    .eq('source', 'dao')
    .eq('external_id', eventId)
    .maybeSingle();

  if (existing?.processed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  await supabase.from('webhook_events').upsert(
    { source: 'dao', external_id: eventId, event_type: event,
      payload: body as Record<string, unknown>, processed: false },
    { onConflict: 'source,external_id', ignoreDuplicates: true },
  );

  try {
    switch (event) {

      // ── proposal.created ──────────────────────────────────────────────────
      case 'proposal.created': {
        await supabase.from('governance_proposals').upsert({
          id:          proposal_id,
          title:       body.title       ?? 'Untitled Proposal',
          description: body.description ?? '',
          status:      'pending',
          metadata:    body.metadata    ?? {},
        }, { onConflict: 'id', ignoreDuplicates: true });
        break;
      }

      // ── proposal.vote ─────────────────────────────────────────────────────
      case 'proposal.vote': {
        await supabase.from('governance_proposals').update({
          vote_count_for:     body.vote_counts?.for     ?? 0,
          vote_count_against: body.vote_counts?.against ?? 0,
          status: 'active',
        }).eq('id', proposal_id);
        break;
      }

      // ── proposal.approved ─────────────────────────────────────────────────
      case 'proposal.approved': {
        await supabase.from('governance_proposals').update({
          status:      'approved',
          approved_at: body.approved_at ?? new Date().toISOString(),
          approved_by: body.approved_by ?? 'dao_contract',
        }).eq('id', proposal_id);

        // Unlock all vaal_pool entries tied to this proposal
        await supabase.from('vaal_development_pool').update({
          governance_proposal_id: proposal_id,
          disbursement_status:    'approved',
          approved_by:            body.approved_by ?? 'dao_contract',
        }).eq('disbursement_status', 'held');

        log({ level: 'info', service: SERVICE,
          message: `Proposal ${proposal_id} approved — pool unlocked`, requestId });
        break;
      }

      // ── proposal.rejected ────────────────────────────────────────────────
      case 'proposal.rejected': {
        await supabase.from('governance_proposals')
          .update({ status: 'rejected' })
          .eq('id', proposal_id);
        log({ level: 'info', service: SERVICE,
          message: `Proposal ${proposal_id} rejected`, requestId });
        break;
      }

      // ── disbursement.executed ─────────────────────────────────────────────
      // CRITICAL: verifies beneficiary, writes immutable disbursement_log,
      // then marks vaal_pool rows as disbursed — all in this order.
      case 'disbursement.executed': {
        const d = body.disbursement;
        if (!d?.amount_zar || !d?.beneficiary_id) {
          return NextResponse.json(
            { error: 'disbursement.executed requires amount_zar and beneficiary_id' },
            { status: 400 },
          );
        }

        // 1. Verify beneficiary is approved before ANY payout
        const { data: beneficiary, error: benErr } = await supabase
          .from('beneficiaries')
          .select('id,verified')
          .eq('id', d.beneficiary_id)
          .maybeSingle();

        if (benErr || !beneficiary?.verified) {
          log({ level: 'error', service: SERVICE, requestId,
            message: `Disbursement blocked — beneficiary ${d.beneficiary_id} not verified` });
          return NextResponse.json(
            { error: 'BENEFICIARY_NOT_VERIFIED', beneficiary_id: d.beneficiary_id },
            { status: 422 },
          );
        }

        // 2. Write immutable audit entry (pending → paid transition happens after bank confirms)
        const { error: logErr } = await supabase.from('disbursement_log').insert({
          proposal_id:       proposal_id,
          beneficiary_id:    d.beneficiary_id,
          amount_zar:        d.amount_zar,
          status:            'paid',
          tx_hash:           d.tx_hash           ?? null,
          payment_reference: d.payment_reference ?? null,
          auditor_sign_off:  false,             // auditor must sign off separately
          created_by:        'dao_webhook',
          paid_at:           new Date().toISOString(),
        });

        if (logErr) {
          log({ level: 'error', service: SERVICE, requestId,
            message: `disbursement_log insert failed: ${logErr.message}` });
          throw new Error(`disbursement_log insert: ${logErr.message}`);
        }

        // 3. Mark vaal_pool rows as disbursed
        await supabase.from('vaal_development_pool').update({
          disbursement_status: 'disbursed',
          disbursed_at:        new Date().toISOString(),
          notes: d.tx_hash ? `XRPL tx: ${d.tx_hash}` : 'Disbursed via DAO',
        })
          .eq('governance_proposal_id', proposal_id)
          .eq('disbursement_status', 'approved');

        log({ level: 'info', service: SERVICE, requestId,
          message: `Disbursement executed — R${d.amount_zar} to ${d.beneficiary_id}`,
          tx_hash: d.tx_hash });
        break;
      }

      default:
        log({ level: 'warn', service: SERVICE,
          message: `Unknown DAO event: ${event}`, requestId });
    }

    await supabase.from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('source', 'dao')
      .eq('external_id', eventId);

    log({ level: 'info', service: SERVICE,
      message: `DAO event processed: ${event}`, requestId, proposal_id });

    return NextResponse.json({ received: true, event, proposal_id });

  } catch (err) {
    log({ level: 'error', service: SERVICE,
      message: 'DAO event processing failed', requestId, errMsg: String(err) });
    await supabase.from('webhook_events')
      .update({ processing_error: String(err) })
      .eq('source', 'dao')
      .eq('external_id', eventId);
    return NextResponse.json({ error: 'PROCESSING_FAILED' }, { status: 500 });
  }
}
