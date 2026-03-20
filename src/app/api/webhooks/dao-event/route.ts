export const runtime = 'nodejs';
/**
 * Sentinel DAO Event Webhook — Phase 2, RICE #2 (Community Revenue Node)
 *
 * Receives governance events from Sentinel DAO (on-chain + multi-sig treasury).
 * Only releases community funds AFTER a governance_proposal is approved.
 *
 * Supported events:
 *   proposal.created    — record proposal in governance_proposals
 *   proposal.vote       — update vote counts
 *   proposal.approved   — unlock vaal_development_pool disbursement
 *   proposal.rejected   — cancel pending disbursements
 *   disbursement.executed — mark vaal_pool entries as disbursed
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
  const rec = Buffer.from(sigHex, 'hex');
  if (exp.length !== rec.length) return false;
  return crypto.timingSafeEqual(exp, rec);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = generateRequestId();

  const signature  = request.headers.get('x-dao-signature');
  const tsHeader   = request.headers.get('x-dao-timestamp');
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

  let body: {
    event: string;
    proposal_id: string;
    title?: string;
    description?: string;
    vote_counts?: { for: number; against: number };
    status?: string;
    approved_at?: string;
    approved_by?: string;
    disbursement?: { amount_zar: number; beneficiary_id: string; tx_hash?: string };
    metadata?: Record<string, unknown>;
  };

  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const supabase = getSupabaseClient();
  const { event, proposal_id } = body;

  if (!event || !proposal_id) {
    return NextResponse.json({ error: 'Missing event or proposal_id' }, { status: 400 });
  }

  // Idempotency
  const eventId = `${event}:${proposal_id}`;
  const { data: existing } = await supabase.from('webhook_events')
    .select('id,processed').eq('source', 'dao').eq('external_id', eventId).maybeSingle();
  if (existing?.processed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  await supabase.from('webhook_events').upsert({
    source: 'dao', external_id: eventId, event_type: event,
    payload: body as Record<string, unknown>, processed: false,
  }, { onConflict: 'source,external_id', ignoreDuplicates: true });

  try {
    switch (event) {
      case 'proposal.created': {
        await supabase.from('governance_proposals').upsert({
          id: proposal_id,
          title:       body.title ?? 'Untitled Proposal',
          description: body.description ?? '',
          status:      'pending',
          metadata:    body.metadata ?? {},
        }, { onConflict: 'id', ignoreDuplicates: true });
        break;
      }

      case 'proposal.vote': {
        await supabase.from('governance_proposals').update({
          vote_count_for:     body.vote_counts?.for ?? 0,
          vote_count_against: body.vote_counts?.against ?? 0,
          status:             'active',
        }).eq('id', proposal_id);
        break;
      }

      case 'proposal.approved': {
        await supabase.from('governance_proposals').update({
          status:      'approved',
          approved_at: body.approved_at ?? new Date().toISOString(),
          approved_by: body.approved_by ?? 'dao_contract',
        }).eq('id', proposal_id);

        // Unlock all vaal_pool entries linked to this proposal
        await supabase.from('vaal_development_pool').update({
          governance_proposal_id: proposal_id,
          disbursement_status:    'approved',
          approved_by:            body.approved_by ?? 'dao_contract',
        }).eq('disbursement_status', 'held');

        log({ level: 'info', service: SERVICE, message: `Proposal ${proposal_id} approved — pool unlocked`, requestId });
        break;
      }

      case 'proposal.rejected': {
        await supabase.from('governance_proposals').update({ status: 'rejected' }).eq('id', proposal_id);
        log({ level: 'info', service: SERVICE, message: `Proposal ${proposal_id} rejected`, requestId });
        break;
      }

      case 'disbursement.executed': {
        if (body.disbursement) {
          await supabase.from('vaal_development_pool').update({
            disbursement_status: 'disbursed',
            disbursed_at:        new Date().toISOString(),
            notes:               body.disbursement.tx_hash ? `XRPL tx: ${body.disbursement.tx_hash}` : 'Disbursed',
          }).eq('governance_proposal_id', proposal_id).eq('disbursement_status', 'approved');
        }
        break;
      }

      default:
        log({ level: 'warn', service: SERVICE, message: `Unknown DAO event: ${event}`, requestId });
    }

    await supabase.from('webhook_events').update({ processed: true, processed_at: new Date().toISOString() })
      .eq('source', 'dao').eq('external_id', eventId);

    log({ level: 'info', service: SERVICE, message: `DAO event processed: ${event}`, requestId, proposal_id });
    return NextResponse.json({ received: true, event, proposal_id });

  } catch (err) {
    log({ level: 'error', service: SERVICE, message: 'DAO event processing failed', requestId, errMsg: String(err) });
    await supabase.from('webhook_events').update({ processing_error: String(err) })
      .eq('source', 'dao').eq('external_id', eventId);
    return NextResponse.json({ error: 'PROCESSING_FAILED' }, { status: 500 });
  }
}
