/**
 * MPP Server Helpers — shared config and Supabase recording for Apex API routes
 *
 * Each route creates its own mppx instance (module-level const) so TypeScript
 * can infer the concrete Mppx<[charge, session]> type and expose .tempo.charge/.tempo.session.
 * This file exports the shared building blocks: pricing, recipient, feePayer, recordMppPayment.
 *
 * MPP: https://mpp.dev/overview
 * mppx: https://mpp.dev/sdk/typescript
 */

import { privateKeyToAccount } from 'viem/accounts';
import { defaultToken, tempoChainId } from './tempo-chain';
import { getSupabaseClient } from '@/lib/supabase';
import { log } from '@/lib/api-utils';

// ─── Env-driven config ────────────────────────────────────────────────────────

/** Apex wallet address that receives all MPP payments */
export function getRecipient(): `0x${string}` {
  const addr = process.env.APEX_TEMPO_RECIPIENT;
  if (!addr) throw new Error('APEX_TEMPO_RECIPIENT env var is not set');
  return addr as `0x${string}`;
}

/**
 * Optional fee payer account — when set, Apex sponsors client gas fees so
 * agents don't need to hold gas tokens (pure UX improvement).
 */
export function getFeePayer() {
  const key = process.env.APEX_FEE_PAYER_KEY;
  if (!key) return undefined;
  return privateKeyToAccount(key as `0x${string}`);
}

// ─── Pricing (human-readable USD strings, TIP-20 has 6 decimals) ─────────────

export const MPP_PRICING = {
  analyticsQuery:  '0.001',   // $0.001 per creator analytics query  — charge intent
  creatorReport:   '0.010',   // $0.01  per full creator report       — charge intent
  treasuryQuery:   '0.0001',  // $0.0001 per treasury pool query      — session intent
  emotionAnalysis: '0.005',   // $0.005 per Kimi emotion analysis     — charge intent
} as const;

// ─── Record verified MPP payment to Supabase ─────────────────────────────────

export interface MppPaymentRecord {
  creatorId:         string;
  amountUsd:         string;
  mppIntent:         'charge' | 'session';
  receiptReference:  string;
  sessionChannelId?: string;
}

/**
 * Persist a verified MPP payment as a transaction row.
 * Called after mppx has verified the credential — failure here is non-fatal.
 */
export async function recordMppPayment(
  record: MppPaymentRecord,
  requestId: string,
): Promise<void> {
  try {
    const supabase  = getSupabaseClient();
    const amountZar = parseFloat(record.amountUsd); // pathUSD ≈ USD; ZAR FX applied at payout

    await supabase.rpc('insert_transaction_serializable', {
      p_creator_id:              record.creatorId,
      p_customer_id:             null,
      p_amount_zar:              amountZar,
      p_platform_fee_zar:        amountZar,
      p_gateway:                 'tempo_mpp',
      p_gateway_ref:             record.receiptReference,
      p_external_id:             record.receiptReference,
      p_status:                  'success',
      p_type:                    'one_time',
      p_source_type:             `mpp_${record.mppIntent}`,
      p_community_impact:        false,
      p_emotion_state:           'neutral',
      p_is_cross_border:         true,
      p_source_currency:         'USD',
      p_destination_currency:    'ZAR',
      p_source_country:          null,
      p_destination_country:     'ZA',
      p_metadata:                { mpp_intent: record.mppIntent, amount_usd: record.amountUsd },
      p_settlement_pathway:      'tempo_mpp',
      p_mpp_receipt_reference:   record.receiptReference,
      p_mpp_session_channel_id:  record.sessionChannelId ?? null,
      p_mpp_intent:              record.mppIntent,
      p_tempo_chain_id:          tempoChainId,
      p_tip20_token_address:     defaultToken,
      p_tip20_amount:            parseFloat(record.amountUsd),
    });

    log({ level: 'info', service: 'mpp', requestId,
      message: `MPP ${record.mppIntent} recorded — $${record.amountUsd}`,
      receipt: record.receiptReference });
  } catch (err) {
    log({ level: 'warn', service: 'mpp', requestId,
      message: `recordMppPayment failed (non-fatal): ${String(err)}` });
  }
}

// Re-export token for convenience
export { defaultToken };
