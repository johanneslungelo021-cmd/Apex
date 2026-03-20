/**
 * Serializable transaction insert with SQLSTATE 40001 retry
 *
 * The dual-trigger architecture (treasury_auto_split + community_impact)
 * requires SERIALIZABLE isolation to prevent race conditions.
 * This utility calls the insert_transaction_serializable RPC and
 * retries on serialization failures with exponential backoff + jitter.
 */

import { getSupabaseClient } from '@/lib/supabase';
import { log } from '@/lib/api-utils';

const SERVICE = 'treasury-insert';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 50;

interface TransactionPayload {
  creator_id: string;
  customer_id?: string | null;
  amount_zar: number;
  platform_fee_zar: number;
  gateway: string;
  gateway_ref?: string | null;
  external_id?: string | null;
  status: string;
  type: string;
  source_type?: string;
  community_impact: boolean;
  emotion_state: string;
  is_cross_border?: boolean;
  source_currency?: string | null;
  destination_currency?: string | null;
  source_country?: string | null;
  destination_country?: string | null;
  metadata?: Record<string, unknown> | null;
}

type InsertResult =
  | { success: true; data: { id: string; amount_zar: number; status: string; emotion_state: string } }
  | { success: false; error: string; code: string; duplicate?: boolean };

export async function insertTransactionSerializable(
  payload: TransactionPayload,
  requestId: string,
): Promise<InsertResult> {
  const supabase = getSupabaseClient();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { data, error } = await supabase.rpc('insert_transaction_serializable', {
      p_creator_id:           payload.creator_id,
      p_customer_id:          payload.customer_id ?? null,
      p_amount_zar:           payload.amount_zar,
      p_platform_fee_zar:     payload.platform_fee_zar,
      p_gateway:              payload.gateway,
      p_gateway_ref:          payload.gateway_ref ?? null,
      p_external_id:          payload.external_id ?? null,
      p_status:               payload.status,
      p_type:                 payload.type,
      p_source_type:          payload.source_type ?? 'standard_subscription',
      p_community_impact:     payload.community_impact,
      p_emotion_state:        payload.emotion_state,
      p_is_cross_border:      payload.is_cross_border ?? false,
      p_source_currency:      payload.source_currency ?? null,
      p_destination_currency: payload.destination_currency ?? null,
      p_source_country:       payload.source_country ?? null,
      p_destination_country:  payload.destination_country ?? null,
      p_metadata:             payload.metadata ?? null,
    });

    if (error) {
      log({ level: 'error', service: SERVICE, message: 'RPC error', requestId, attempt, errMsg: error.message });
      return { success: false, error: error.message, code: 'RPC_ERROR' };
    }

    const result = data as { error?: string; code?: string; id?: string; amount_zar?: number; status?: string; emotion_state?: string };

    // Duplicate — idempotent success
    if (result.code === '23505' || result.error === 'DUPLICATE') {
      return { success: false, error: 'DUPLICATE', code: '23505', duplicate: true };
    }

    // Serialization failure — retry with exponential backoff + jitter
    if (result.code === '40001' || result.error === 'SERIALIZATION_FAILURE') {
      if (attempt >= MAX_RETRIES) {
        log({ level: 'warn', service: SERVICE, message: `Serialization failure after ${MAX_RETRIES} retries`, requestId });
        return { success: false, error: 'SERIALIZATION_FAILURE', code: '40001' };
      }
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 20;
      log({ level: 'warn', service: SERVICE, message: `SQLSTATE 40001 — retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`, requestId });
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    // Any other error
    if (result.error) {
      log({ level: 'error', service: SERVICE, message: `DB error: ${result.error}`, requestId, code: result.code });
      return { success: false, error: result.error, code: result.code ?? 'UNKNOWN' };
    }

    // Success
    return {
      success: true,
      data: {
        id:            result.id!,
        amount_zar:    result.amount_zar!,
        status:        result.status!,
        emotion_state: result.emotion_state!,
      },
    };
  }

  return { success: false, error: 'MAX_RETRIES_EXCEEDED', code: '40001' };
}
