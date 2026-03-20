/**
 * Tempo SDK — Machine Payments Protocol (MPP) Integration
 *
 * Provides the financial plumbing layer between Apex agents and the
 * South African fiat economy via Tempo's Visa/Mastercard card rails.
 *
 * Core capabilities:
 *   1. provisionAgentCard()     — create a Tempo Visa virtual card per agent
 *   2. replenishAgentCard()     — top up a card from the treasury pool
 *   3. initiateXrplSettlement() — bridge XRPL liquidity → ZAR via Tempo MPP
 *   4. getSettlementStatus()    — poll a Tempo settlement for status
 *   5. suspendAgentCard()       — emergency card freeze
 *
 * Settlement pathway priority:
 *   1. XRPL on-chain (cheapest, ~3s)
 *   2. Tempo MPP Visa rails (regulatory backstop, ~T+1)
 *   3. Paystack fallback (SA domestic, ~T+2)
 *
 * APEX protocol: every fetch wrapped in try/catch, no silent failures,
 * all amounts in ZAR cents internally, returned as decimal ZAR.
 *
 * Env vars required:
 *   TEMPO_API_KEY        — Tempo platform API key
 *   TEMPO_WEBHOOK_SECRET — HMAC-SHA256 secret for webhook verification
 *   TEMPO_BASE_URL       — defaults to https://api.tempo.money/v1
 */

import crypto from 'crypto';
import { getSupabaseClient } from '@/lib/supabase';
import { log } from '@/lib/api-utils';

const SERVICE = 'tempo-sdk';
const TEMPO_BASE = process.env.TEMPO_BASE_URL ?? 'https://api.tempo.money/v1';
const REQUEST_TIMEOUT_MS = 10_000;

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SettlementPathway = 'xrpl_direct' | 'tempo_mpp' | 'paystack_fallback';

export interface AgentCardConfig {
  agentId:       string;   // e.g. 'scout-agent'
  agentLabel:    string;   // e.g. 'Scout Agent — Wellfound Integrations'
  purpose:       string;   // e.g. 'infrastructure'
  spendingLimitZar:    number;
  replenishThresholdZar: number;
  replenishAmountZar:    number;
}

export interface ProvisionedCard {
  tempoCardToken:  string;
  visaBin:         string;
  lastFour:        string;
  expiryMonth:     number;
  expiryYear:      number;
  status:          'active' | 'pending';
  spendingLimitZar: number;
}

export interface SettlementRequest {
  xrplTxHash:    string;
  xrplDrops:     bigint;         // XRP in drops (1 XRP = 1_000_000 drops)
  xrplLedgerIndex: number;
  destinationZar: number;        // expected ZAR after conversion
  creatorId:      string;
  transactionId?: string;        // existing transactions row to update
  agentCardToken?: string;       // route through specific virtual card
}

export interface SettlementResult {
  tempoRef:       string;
  status:         'pending' | 'bridging' | 'settled' | 'failed';
  grossAmountZar: number;
  tempoFeeZar:    number;
  netAmountZar:   number;
  exchangeRate:   number;         // XRP/ZAR
  visaAuthCode?:  string;
  estimatedSettlementAt?: string; // ISO timestamp
}

// ─── Internal fetch helper ─────────────────────────────────────────────────────

async function tempoFetch<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  body?: unknown,
  requestId = 'system',
): Promise<{ data: T | null; error: string | null }> {
  const apiKey = process.env.TEMPO_API_KEY;
  if (!apiKey) {
    log({ level: 'error', service: SERVICE, requestId, message: 'TEMPO_API_KEY not set' });
    return { data: null, error: 'TEMPO_API_KEY_NOT_SET' };
  }

  try {
    const res = await fetch(`${TEMPO_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Apex-Request-Id': requestId,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      log({ level: 'warn', service: SERVICE, requestId,
        message: `Tempo API ${method} ${path} → ${res.status}`, errText });
      return { data: null, error: `TEMPO_${res.status}: ${errText}` };
    }

    const data = await res.json() as T;
    return { data, error: null };
  } catch (err) {
    log({ level: 'error', service: SERVICE, requestId,
      message: `Tempo fetch failed: ${String(err)}`, path });
    return { data: null, error: String(err) };
  }
}

// ─── 1. Provision Agent Virtual Card ─────────────────────────────────────────

/**
 * Provisions a Tempo Visa virtual card for a specific agent identity.
 * Each agent gets exactly one card (enforced by UNIQUE on agent_id).
 * The card token is stored in agent_virtual_cards; the raw PAN never touches
 * our database (Tempo handles PCI scope).
 */
export async function provisionAgentCard(
  config: AgentCardConfig,
  requestId = 'system',
): Promise<{ card: ProvisionedCard | null; error: string | null }> {
  log({ level: 'info', service: SERVICE, requestId,
    message: `Provisioning virtual card for agent: ${config.agentId}` });

  // Check if card already exists
  const supabase = getSupabaseClient();
  const { data: existing } = await supabase
    .from('agent_virtual_cards')
    .select('id, tempo_card_token, status')
    .eq('agent_id', config.agentId)
    .maybeSingle();

  if (existing) {
    log({ level: 'info', service: SERVICE, requestId,
      message: `Card already exists for ${config.agentId} (status: ${existing.status})` });
    return {
      card: null,
      error: `CARD_ALREADY_EXISTS:${existing.tempo_card_token}`,
    };
  }

  // Call Tempo API to provision
  const { data, error } = await tempoFetch<{
    card_token: string; bin: string; last_four: string;
    expiry_month: number; expiry_year: number; status: string;
  }>('/cards/virtual', 'POST', {
    agent_id:       config.agentId,
    label:          config.agentLabel,
    currency:       'ZAR',
    spending_limit: Math.round(config.spendingLimitZar * 100), // send in cents
    purpose:        config.purpose,
  }, requestId);

  if (error || !data) {
    return { card: null, error: error ?? 'TEMPO_PROVISION_FAILED' };
  }

  // Persist to agent_virtual_cards
  const { error: dbErr } = await supabase.from('agent_virtual_cards').insert({
    agent_id:              config.agentId,
    agent_label:           config.agentLabel,
    tempo_card_token:      data.card_token,
    visa_bin:              data.bin,
    last_four:             data.last_four,
    expiry_month:          data.expiry_month,
    expiry_year:           data.expiry_year,
    currency:              'ZAR',
    spending_limit_zar:    config.spendingLimitZar,
    balance_zar:           0,
    status:                'active',
    purpose:               config.purpose,
    auto_replenish:        true,
    replenish_threshold_zar: config.replenishThresholdZar,
    replenish_amount_zar:    config.replenishAmountZar,
  });

  if (dbErr) {
    log({ level: 'error', service: SERVICE, requestId,
      message: `agent_virtual_cards insert failed: ${dbErr.message}` });
    // Card is provisioned in Tempo but not saved — attempt to suspend it
    void tempoFetch(`/cards/${data.card_token}/suspend`, 'PATCH', undefined, requestId);
    return { card: null, error: `DB_PERSIST_FAILED: ${dbErr.message}` };
  }

  log({ level: 'info', service: SERVICE, requestId,
    message: `Card provisioned for ${config.agentId} — last four: ${data.last_four}` });

  return {
    card: {
      tempoCardToken:   data.card_token,
      visaBin:          data.bin,
      lastFour:         data.last_four,
      expiryMonth:      data.expiry_month,
      expiryYear:       data.expiry_year,
      status:           'active',
      spendingLimitZar: config.spendingLimitZar,
    },
    error: null,
  };
}

// ─── 2. Replenish Agent Card ──────────────────────────────────────────────────

/**
 * Top up an agent's virtual card from the treasury pool.
 * Only fires if balance is below replenish_threshold_zar.
 * Records the replenishment as a transaction with gateway='tempo_mpp'.
 */
export async function replenishAgentCard(
  agentId: string,
  forceAmountZar?: number,
  requestId = 'system',
): Promise<{ replenished: boolean; newBalanceZar: number; error: string | null }> {
  const supabase = getSupabaseClient();

  const { data: card } = await supabase
    .from('agent_virtual_cards')
    .select('*')
    .eq('agent_id', agentId)
    .eq('status', 'active')
    .maybeSingle();

  if (!card) {
    return { replenished: false, newBalanceZar: 0, error: 'CARD_NOT_FOUND' };
  }

  const topUpZar = forceAmountZar ?? card.replenish_amount_zar;

  if (!forceAmountZar && card.balance_zar > card.replenish_threshold_zar) {
    log({ level: 'info', service: SERVICE, requestId,
      message: `${agentId} balance R${card.balance_zar} above threshold — skipping replenish` });
    return { replenished: false, newBalanceZar: card.balance_zar, error: null };
  }

  const { data, error } = await tempoFetch<{ new_balance: number; tempo_ref: string }>(
    `/cards/${card.tempo_card_token}/replenish`, 'POST',
    { amount_cents: Math.round(topUpZar * 100), currency: 'ZAR' },
    requestId,
  );

  if (error || !data) {
    return { replenished: false, newBalanceZar: card.balance_zar, error: error ?? 'REPLENISH_FAILED' };
  }

  const newBalance = data.new_balance / 100;

  await supabase.from('agent_virtual_cards').update({
    balance_zar:  newBalance,
    last_used_at: new Date().toISOString(),
  }).eq('id', card.id);

  log({ level: 'info', service: SERVICE, requestId,
    message: `${agentId} replenished R${topUpZar} → new balance R${newBalance}` });

  return { replenished: true, newBalanceZar: newBalance, error: null };
}

// ─── 3. Initiate XRPL → ZAR Settlement ───────────────────────────────────────

/**
 * Bridge XRPL liquidity to ZAR through Tempo's Visa card rails.
 * This is the core MPP function — turns on-chain XRP into spendable ZAR
 * without requiring a full SARB crypto licence (settlement uses Visa rails).
 *
 * Creates an mpp_settlement_log entry and updates the linked transaction
 * with settlement_pathway='tempo_mpp' and mpp_settlement_status='bridging'.
 */
export async function initiateXrplSettlement(
  req: SettlementRequest,
  requestId = 'system',
): Promise<{ result: SettlementResult | null; error: string | null }> {
  log({ level: 'info', service: SERVICE, requestId,
    message: `Initiating XRPL→ZAR settlement: ${req.xrplTxHash}`,
    drops: req.xrplDrops.toString(), targetZar: req.destinationZar });

  const { data, error } = await tempoFetch<{
    tempo_ref: string;
    status: string;
    gross_amount_cents: number;
    tempo_fee_cents: number;
    net_amount_cents: number;
    exchange_rate: number;
    visa_auth_code?: string;
    estimated_settlement_at?: string;
  }>('/settlements/xrpl', 'POST', {
    xrpl_tx_hash:     req.xrplTxHash,
    xrpl_drops:       req.xrplDrops.toString(),
    xrpl_ledger_index: req.xrplLedgerIndex,
    target_currency:  'ZAR',
    creator_id:       req.creatorId,
    card_token:       req.agentCardToken,
  }, requestId);

  if (error || !data) {
    return { result: null, error: error ?? 'SETTLEMENT_INITIATION_FAILED' };
  }

  const result: SettlementResult = {
    tempoRef:       data.tempo_ref,
    status:         data.status as SettlementResult['status'],
    grossAmountZar: data.gross_amount_cents / 100,
    tempoFeeZar:    data.tempo_fee_cents / 100,
    netAmountZar:   data.net_amount_cents / 100,
    exchangeRate:   data.exchange_rate,
    visaAuthCode:   data.visa_auth_code,
    estimatedSettlementAt: data.estimated_settlement_at,
  };

  // Persist to mpp_settlement_log
  const supabase = getSupabaseClient();
  const { error: logErr } = await supabase.from('mpp_settlement_log').insert({
    transaction_id:     req.transactionId ?? null,
    settlement_pathway: 'tempo_mpp',
    xrpl_tx_hash:       req.xrplTxHash,
    xrpl_amount_drops:  req.xrplDrops.toString(),
    xrpl_ledger_index:  req.xrplLedgerIndex,
    tempo_ref:          data.tempo_ref,
    tempo_card_token:   req.agentCardToken ?? null,
    visa_auth_code:     data.visa_auth_code ?? null,
    gross_amount_zar:   result.grossAmountZar,
    tempo_fee_zar:      result.tempoFeeZar,
    net_amount_zar:     result.netAmountZar,
    exchange_rate:      data.exchange_rate,
    status:             result.status,
    initiated_by:       'system',
  });

  if (logErr) {
    log({ level: 'warn', service: SERVICE, requestId,
      message: `mpp_settlement_log insert failed (non-fatal): ${logErr.message}` });
  }

  // Update linked transaction if provided
  if (req.transactionId) {
    await supabase.from('transactions').update({
      gateway:              'tempo_mpp',
      settlement_pathway:   'tempo_mpp',
      mpp_settlement_id:    data.tempo_ref,
      mpp_settlement_status: result.status,
      tempo_token_id:       data.tempo_ref,
      visa_auth_code:       data.visa_auth_code ?? null,
      xrpl_to_zar_rate:     data.exchange_rate,
    }).eq('id', req.transactionId);
  }

  log({ level: 'info', service: SERVICE, requestId,
    message: `Settlement initiated: ${data.tempo_ref} — R${result.netAmountZar} net`,
    exchangeRate: data.exchange_rate });

  return { result, error: null };
}

// ─── 4. Get Settlement Status ─────────────────────────────────────────────────

export async function getSettlementStatus(
  tempoRef: string,
  requestId = 'system',
): Promise<{ status: string | null; error: string | null }> {
  const { data, error } = await tempoFetch<{ status: string; settled_at?: string }>(
    `/settlements/${tempoRef}`, 'GET', undefined, requestId,
  );
  if (error || !data) return { status: null, error };
  return { status: data.status, error: null };
}

// ─── 5. Suspend Agent Card (emergency) ───────────────────────────────────────

export async function suspendAgentCard(
  agentId: string,
  reason: string,
  requestId = 'system',
): Promise<{ suspended: boolean; error: string | null }> {
  const supabase = getSupabaseClient();

  const { data: card } = await supabase
    .from('agent_virtual_cards')
    .select('id, tempo_card_token')
    .eq('agent_id', agentId)
    .maybeSingle();

  if (!card) return { suspended: false, error: 'CARD_NOT_FOUND' };

  const { error: tempoErr } = await tempoFetch(
    `/cards/${card.tempo_card_token}/suspend`, 'PATCH',
    { reason }, requestId,
  );

  if (tempoErr) return { suspended: false, error: tempoErr };

  await supabase.from('agent_virtual_cards').update({ status: 'suspended' }).eq('id', card.id);

  log({ level: 'warn', service: SERVICE, requestId,
    message: `Card suspended for agent ${agentId}: ${reason}` });

  return { suspended: true, error: null };
}

// ─── Webhook Signature Verification ──────────────────────────────────────────

/**
 * Verify a Tempo webhook signature (HMAC-SHA256, timing-safe).
 * Tempo sends X-Tempo-Signature: sha256=<hex>
 */
export function verifyTempoSignature(
  rawBody: string,
  signature: string,
): boolean {
  const secret = process.env.TEMPO_WEBHOOK_SECRET;
  if (!secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigHex   = signature.replace('sha256=', '');
  const exp = Buffer.from(expected, 'hex');
  const rec = Buffer.from(sigHex,   'hex');
  if (exp.length !== rec.length) return false;
  return crypto.timingSafeEqual(exp, rec);
}
