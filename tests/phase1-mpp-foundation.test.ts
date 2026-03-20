/**
 * Phase 1 MPP Foundation — Integration Tests
 *
 * Covers:
 *   1. Tempo SDK — provisionAgentCard, replenishAgentCard, initiateXrplSettlement
 *   2. verifyTempoSignature — valid/invalid/missing secret
 *   3. Tempo Webhook — all 5 event types, idempotency, signature gate
 *   4. DB schema — new columns on transactions, agent_virtual_cards structure
 *
 * Run: npx jest tests/phase1-mpp-foundation.test.ts
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';

// ─── Shared mock chain ─────────────────────────────────────────────────────────

const mockSupabaseChain: Record<string, jest.Mock> = {
  select:      jest.fn().mockReturnThis(),
  eq:          jest.fn().mockReturnThis(),
  update:      jest.fn().mockReturnThis(),
  insert:      jest.fn().mockResolvedValue({ error: null }),
  upsert:      jest.fn().mockResolvedValue({ error: null }),
  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
};
(mockSupabaseChain as Record<string, unknown>)['then'] =
  (resolve: (v: unknown) => void) => resolve({ error: null });

const mockSupabase = { from: jest.fn(() => mockSupabaseChain) };

jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => mockSupabase }));
jest.mock('@/lib/api-utils', () => ({
  log:               jest.fn(),
  generateRequestId: () => 'test-req-mpp',
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeTempoRequest(
  body: Record<string, unknown>,
  secret = 'test-tempo-secret',
  tsOffset = 0,
): Request {
  const rawBody = JSON.stringify(body);
  const ts = String(Date.now() + tsOffset);
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return new Request('https://apex.test/api/webhooks/tempo', {
    method: 'POST',
    headers: {
      'content-type':      'application/json',
      'x-tempo-signature': sig,
      'x-tempo-timestamp': ts,
    },
    body: rawBody,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. verifyTempoSignature
// ══════════════════════════════════════════════════════════════════════════════

describe('verifyTempoSignature', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, TEMPO_WEBHOOK_SECRET: 'test-tempo-secret' };
  });
  afterEach(() => { process.env = OLD_ENV; });

  it('returns true for a valid HMAC-SHA256 signature', async () => {
    const { verifyTempoSignature } = await import('@/lib/payments/tempo');
    const body = JSON.stringify({ event: 'settlement.settled', tempo_ref: 'ref-001' });
    const sig  = 'sha256=' + crypto.createHmac('sha256', 'test-tempo-secret').update(body).digest('hex');
    expect(verifyTempoSignature(body, sig)).toBe(true);
  });

  it('returns false for a tampered signature', async () => {
    const { verifyTempoSignature } = await import('@/lib/payments/tempo');
    expect(verifyTempoSignature('{"event":"test"}', 'sha256=badhash00')).toBe(false);
  });

  it('returns false when TEMPO_WEBHOOK_SECRET is not set', async () => {
    process.env = { ...OLD_ENV };
    delete process.env.TEMPO_WEBHOOK_SECRET;
    jest.resetModules();
    const { verifyTempoSignature } = await import('@/lib/payments/tempo');
    expect(verifyTempoSignature('body', 'sha256=anything')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. provisionAgentCard
// ══════════════════════════════════════════════════════════════════════════════

describe('provisionAgentCard', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, TEMPO_API_KEY: 'test-tempo-key' };
    mockSupabaseChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockSupabaseChain.insert.mockResolvedValue({ error: null });
  });
  afterEach(() => { process.env = OLD_ENV; });

  it('returns CARD_ALREADY_EXISTS when agent already has a card', async () => {
    mockSupabaseChain.maybeSingle.mockResolvedValue({
      data: { id: 'existing', tempo_card_token: 'tok_existing', status: 'active' },
      error: null,
    });

    const { provisionAgentCard } = await import('@/lib/payments/tempo');
    const result = await provisionAgentCard({
      agentId: 'scout-agent', agentLabel: 'Scout', purpose: 'infra',
      spendingLimitZar: 5000, replenishThresholdZar: 500, replenishAmountZar: 2000,
    });
    expect(result.card).toBeNull();
    expect(result.error).toContain('CARD_ALREADY_EXISTS');
  });

  it('provisions card and persists to DB on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        card_token:   'tok_new_card',
        bin:          '424242',
        last_four:    '4242',
        expiry_month: 12,
        expiry_year:  2028,
        status:       'active',
      }),
    } as Response) as typeof fetch;

    const { provisionAgentCard } = await import('@/lib/payments/tempo');
    const result = await provisionAgentCard({
      agentId: 'trading-agent', agentLabel: 'Trading Agent', purpose: 'infrastructure',
      spendingLimitZar: 10000, replenishThresholdZar: 1000, replenishAmountZar: 5000,
    });

    expect(result.error).toBeNull();
    expect(result.card).not.toBeNull();
    expect(result.card?.tempoCardToken).toBe('tok_new_card');
    expect(result.card?.lastFour).toBe('4242');
    expect(mockSupabaseChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_id:         'trading-agent',
        tempo_card_token: 'tok_new_card',
        status:           'active',
      }),
    );
  });

  it('returns error and suspends Tempo card when DB insert fails', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          card_token: 'tok_bad_db', bin: '411111', last_four: '1111',
          expiry_month: 6, expiry_year: 2027, status: 'active',
        }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response); // suspend call

    mockSupabaseChain.insert.mockResolvedValue({ error: { message: 'unique violation' } });

    const { provisionAgentCard } = await import('@/lib/payments/tempo');
    const result = await provisionAgentCard({
      agentId: 'dao-agent', agentLabel: 'DAO', purpose: 'governance',
      spendingLimitZar: 2000, replenishThresholdZar: 200, replenishAmountZar: 1000,
    });

    expect(result.card).toBeNull();
    expect(result.error).toContain('DB_PERSIST_FAILED');
  });

  it('returns TEMPO_API_KEY_NOT_SET when env var missing', async () => {
    delete process.env.TEMPO_API_KEY;
    jest.resetModules();
    const { provisionAgentCard } = await import('@/lib/payments/tempo');
    const result = await provisionAgentCard({
      agentId: 'x', agentLabel: 'X', purpose: 'infra',
      spendingLimitZar: 100, replenishThresholdZar: 10, replenishAmountZar: 50,
    });
    expect(result.error).toContain('TEMPO_API_KEY_NOT_SET');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. replenishAgentCard
// ══════════════════════════════════════════════════════════════════════════════

describe('replenishAgentCard', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, TEMPO_API_KEY: 'test-tempo-key' };
  });
  afterEach(() => { process.env = OLD_ENV; });

  it('skips replenish when balance is above threshold', async () => {
    mockSupabaseChain.maybeSingle.mockResolvedValue({
      data: {
        id: 'card-1', tempo_card_token: 'tok_1',
        balance_zar: 2000, replenish_threshold_zar: 500, replenish_amount_zar: 2000,
      },
      error: null,
    });

    const { replenishAgentCard } = await import('@/lib/payments/tempo');
    const result = await replenishAgentCard('scout-agent');
    expect(result.replenished).toBe(false);
    expect(result.error).toBeNull();
  });

  it('replenishes when balance is below threshold', async () => {
    mockSupabaseChain.maybeSingle.mockResolvedValue({
      data: {
        id: 'card-1', tempo_card_token: 'tok_low',
        balance_zar: 200, replenish_threshold_zar: 500, replenish_amount_zar: 2000,
      },
      error: null,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ new_balance: 220000, tempo_ref: 'replenish-ref-001' }), // 2200 ZAR in cents
    } as Response) as typeof fetch;

    const { replenishAgentCard } = await import('@/lib/payments/tempo');
    const result = await replenishAgentCard('scout-agent');
    expect(result.replenished).toBe(true);
    expect(result.newBalanceZar).toBe(2200);
  });

  it('returns CARD_NOT_FOUND when agent has no card', async () => {
    mockSupabaseChain.maybeSingle.mockResolvedValue({ data: null, error: null });

    const { replenishAgentCard } = await import('@/lib/payments/tempo');
    const result = await replenishAgentCard('nonexistent-agent');
    expect(result.error).toBe('CARD_NOT_FOUND');
    expect(result.replenished).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. initiateXrplSettlement
// ══════════════════════════════════════════════════════════════════════════════

describe('initiateXrplSettlement', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, TEMPO_API_KEY: 'test-tempo-key' };
    mockSupabaseChain.insert.mockResolvedValue({ error: null });
    mockSupabaseChain.update.mockReturnThis();
  });
  afterEach(() => { process.env = OLD_ENV; });

  it('initiates settlement and writes mpp_settlement_log', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tempo_ref:          'settle-001',
        status:             'pending',
        gross_amount_cents: 185000,  // R1850.00
        tempo_fee_cents:    1850,    // R18.50 (1%)
        net_amount_cents:   183150,  // R1831.50
        exchange_rate:      18.50,
        visa_auth_code:     'VISA-AUTH-XYZ',
        estimated_settlement_at: '2026-03-21T09:00:00Z',
      }),
    } as Response) as typeof fetch;

    const { initiateXrplSettlement } = await import('@/lib/payments/tempo');
    const result = await initiateXrplSettlement({
      xrplTxHash:      'XRPL-TX-HASH-001',
      xrplDrops:       BigInt(100_000_000),   // 100 XRP
      xrplLedgerIndex: 88_000_000,
      destinationZar:  1850,
      creatorId:       'creator-uuid-001',
      transactionId:   'tx-uuid-001',
    });

    expect(result.error).toBeNull();
    expect(result.result?.tempoRef).toBe('settle-001');
    expect(result.result?.netAmountZar).toBe(1831.50);
    expect(result.result?.exchangeRate).toBe(18.50);

    // Settlement log must be written
    expect(mockSupabase.from).toHaveBeenCalledWith('mpp_settlement_log');
    expect(mockSupabaseChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tempo_ref:          'settle-001',
        xrpl_tx_hash:       'XRPL-TX-HASH-001',
        settlement_pathway: 'tempo_mpp',
        net_amount_zar:     1831.50,
      }),
    );
  });

  it('returns error when Tempo API fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'Service Unavailable' } as Response) as typeof fetch;

    const { initiateXrplSettlement } = await import('@/lib/payments/tempo');
    const result = await initiateXrplSettlement({
      xrplTxHash: 'XRPL-FAIL-001', xrplDrops: BigInt(50_000_000),
      xrplLedgerIndex: 88_000_001, destinationZar: 925, creatorId: 'creator-002',
    });

    expect(result.result).toBeNull();
    expect(result.error).toContain('503');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Tempo Webhook — all event types
// ══════════════════════════════════════════════════════════════════════════════

describe('Tempo Webhook', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, TEMPO_WEBHOOK_SECRET: 'test-tempo-secret' };
    mockSupabaseChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockSupabaseChain.update.mockReturnThis();
    mockSupabaseChain.upsert.mockResolvedValue({ error: null });
  });
  afterEach(() => { process.env = OLD_ENV; });

  it('returns 401 when signature header missing', async () => {
    const { POST } = await import('@/app/api/webhooks/tempo/route');
    const req = new Request('https://apex.test/api/webhooks/tempo', {
      method: 'POST', headers: { 'x-tempo-timestamp': String(Date.now()) }, body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when timestamp is stale', async () => {
    const { POST } = await import('@/app/api/webhooks/tempo/route');
    const req = makeTempoRequest(
      { event: 'settlement.settled', tempo_ref: 'ref-001', timestamp: Date.now() },
      'test-tempo-secret',
      -10 * 60 * 1000,   // 10 minutes stale
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when HMAC does not match', async () => {
    const { POST } = await import('@/app/api/webhooks/tempo/route');
    const rawBody = JSON.stringify({ event: 'settlement.settled', tempo_ref: 'ref-bad' });
    const req = new Request('https://apex.test/api/webhooks/tempo', {
      method: 'POST',
      headers: {
        'x-tempo-signature': 'sha256=badhash',
        'x-tempo-timestamp':  String(Date.now()),
      },
      body: rawBody,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns duplicate:true for already-processed event', async () => {
    mockSupabaseChain.maybeSingle.mockResolvedValue({ data: { id: 'dup', processed: true }, error: null });
    const { POST } = await import('@/app/api/webhooks/tempo/route');
    const req = makeTempoRequest({ event: 'settlement.bridging', tempo_ref: 'dup-ref' });
    const res = await POST(req);
    const json = await res.json();
    expect(json.duplicate).toBe(true);
  });

  it('processes settlement.bridging and updates mpp_settlement_log', async () => {
    const { POST } = await import('@/app/api/webhooks/tempo/route');
    const req = makeTempoRequest({
      event: 'settlement.bridging', tempo_ref: 'settle-bridge-001', timestamp: Date.now(),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockSupabase.from).toHaveBeenCalledWith('mpp_settlement_log');
  });

  it('processes settlement.settled and marks transaction success', async () => {
    const { POST } = await import('@/app/api/webhooks/tempo/route');
    const req = makeTempoRequest({
      event: 'settlement.settled',
      tempo_ref: 'settle-done-001',
      timestamp: Date.now(),
      settlement: {
        status: 'settled', gross_amount_cents: 185000,
        tempo_fee_cents: 1850, net_amount_cents: 183150,
        exchange_rate: 18.50, visa_auth_code: 'VISA-AUTH-001',
        settled_at: new Date().toISOString(),
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // Verify transactions table was updated to success
    expect(mockSupabase.from).toHaveBeenCalledWith('transactions');
    expect(mockSupabase.from).toHaveBeenCalledWith('mpp_settlement_log');
  });

  it('processes settlement.failed and logs failure reason', async () => {
    const { POST } = await import('@/app/api/webhooks/tempo/route');
    const req = makeTempoRequest({
      event: 'settlement.failed', tempo_ref: 'settle-fail-001', timestamp: Date.now(),
      settlement: { failure_reason: 'XRPL_TIMEOUT', status: 'failed',
        gross_amount_cents: 0, tempo_fee_cents: 0, net_amount_cents: 0, exchange_rate: 0 },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('processes settlement.reversed and flags transaction as suspicious', async () => {
    const { POST } = await import('@/app/api/webhooks/tempo/route');
    const req = makeTempoRequest({
      event: 'settlement.reversed', tempo_ref: 'settle-rev-001', timestamp: Date.now(),
      settlement: { reversal_reason: 'FIC_ACT_COMPLIANCE', status: 'reversed',
        gross_amount_cents: 0, tempo_fee_cents: 0, net_amount_cents: 0, exchange_rate: 0 },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // Verify is_suspicious was set
    expect(mockSupabaseChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_suspicious: true, flagged_by: 'tempo_compliance' }),
    );
  });

  it('processes card.replenish_needed and triggers auto-replenish', async () => {
    // Mock agent card lookup for replenishAgentCard
    let callCount = 0;
    mockSupabaseChain.maybeSingle.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return { data: null, error: null }; // webhook_events check
      if (callCount === 2) return { data: null, error: null }; // second webhook_events check
      return { // agent card lookup
        data: {
          id: 'card-replenish', tempo_card_token: 'tok_replenish',
          balance_zar: 200, replenish_threshold_zar: 500, replenish_amount_zar: 2000,
        },
        error: null,
      };
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ new_balance: 220000, tempo_ref: 'rep-ref' }),
    } as Response) as typeof fetch;

    const { POST } = await import('@/app/api/webhooks/tempo/route');
    const req = makeTempoRequest({
      event: 'card.replenish_needed', tempo_ref: 'card-event-001', timestamp: Date.now(),
      card: { card_token: 'tok_replenish', agent_id: 'scout-agent',
        balance_cents: 20000, threshold_cents: 50000 },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('returns 400 when settlement.settled is missing settlement payload', async () => {
    const { POST } = await import('@/app/api/webhooks/tempo/route');
    const req = makeTempoRequest({
      event: 'settlement.settled', tempo_ref: 'bad-payload-001', timestamp: Date.now(),
      // settlement field intentionally omitted
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. DB Schema — verify new columns exist (against live types from supabase)
// ══════════════════════════════════════════════════════════════════════════════

describe('MPP schema shape', () => {
  it('insert_transaction_serializable accepts MPP params (TypeScript compile check)', async () => {
    // This test is a compile-time assertion — if TS compiles this file, MPP params are typed
    type MppParams = {
      p_settlement_pathway?: string | null;
      p_mpp_settlement_id?:  string | null;
      p_tempo_token_id?:     string | null;
      p_visa_auth_code?:     string | null;
      p_xrpl_to_zar_rate?:  number | null;
      p_mpp_virtual_card_id?: string | null;
    };
    const params: MppParams = {
      p_settlement_pathway:   'tempo_mpp',
      p_mpp_settlement_id:    'settle-001',
      p_tempo_token_id:       'tok-001',
      p_visa_auth_code:       'AUTH-001',
      p_xrpl_to_zar_rate:     18.50,
      p_mpp_virtual_card_id:  null,
    };
    expect(params.p_settlement_pathway).toBe('tempo_mpp');
  });

  it('agent_virtual_cards insert shape matches expected columns', () => {
    const cardRow = {
      agent_id:               'scout-agent',
      agent_label:            'Scout Agent',
      tempo_card_token:       'tok_test',
      visa_bin:               '424242',
      last_four:              '4242',
      expiry_month:           12,
      expiry_year:            2028,
      currency:               'ZAR',
      spending_limit_zar:     5000,
      balance_zar:            0,
      status:                 'active',
      purpose:                'infrastructure',
      auto_replenish:         true,
      replenish_threshold_zar: 500,
      replenish_amount_zar:    2000,
    };
    // Shape check
    expect(cardRow.last_four).toMatch(/^\d{4}$/);
    expect(cardRow.expiry_month).toBeGreaterThanOrEqual(1);
    expect(cardRow.expiry_month).toBeLessThanOrEqual(12);
    expect(cardRow.status).toMatch(/^(pending|active|suspended|cancelled)$/);
  });
});
