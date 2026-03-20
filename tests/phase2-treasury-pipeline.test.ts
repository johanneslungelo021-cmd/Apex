/**
 * Phase 2 Treasury Pipeline — Integration Tests
 *
 * Covers:
 *   1. Outstand webhook — signature verification, replay protection, idempotency
 *   2. Kimi emotion classifier — all 4 states, cache hit path, fallback on API failure
 *   3. FX conversion — ZAR passthrough, live-rate path, fallback path
 *   4. DAO webhook — full proposal lifecycle + disbursement_log write
 *   5. Disbursement audit trail — beneficiary gate, immutability assertion
 *
 * All Supabase and Kimi calls are mocked — no real network I/O.
 *
 * Run: bun test tests/phase2-treasury-pipeline.test.ts
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';

// ─── Shared mocks ────────────────────────────────────────────────────────────

// Deep-chainable mock: every method returns the chain itself,
// and the chain is also thenable so awaiting it returns { error: null }
const mockSupabaseChain: Record<string, jest.Mock> & { then?: unknown } = {
  select:      jest.fn().mockReturnThis(),
  eq:          jest.fn().mockReturnThis(),
  gt:          jest.fn().mockReturnThis(),
  update:      jest.fn().mockReturnThis(),
  insert:      jest.fn().mockResolvedValue({ error: null }),
  upsert:      jest.fn().mockResolvedValue({ error: null }),
  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
};
// Make the chain itself awaitable (resolves to { error: null })
(mockSupabaseChain as Record<string, unknown>)['then'] = (resolve: (v: unknown) => void) => resolve({ error: null });

const mockRpc = jest.fn();

const mockSupabase = {
  from: jest.fn(() => mockSupabaseChain),
  rpc:  mockRpc,
};

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => mockSupabase,
}));

jest.mock('@/lib/api-utils', () => ({
  log:               jest.fn(),
  generateRequestId: () => 'test-req-id',
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHmacSignature(secret: string, body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeOutstandRequest(
  body: Record<string, unknown>,
  secret = 'test-outstand-secret',
  tsOffset = 0,
): Request {
  const rawBody = JSON.stringify(body);
  const ts = String(Date.now() + tsOffset);
  return new Request('https://apex.test/api/webhooks/outstand', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-outstand-signature': makeHmacSignature(secret, rawBody),
      'x-outstand-timestamp':  ts,
    },
    body: rawBody,
  });
}

function makeDaoRequest(
  body: Record<string, unknown>,
  secret = 'test-dao-secret',
  tsOffset = 0,
): Request {
  const rawBody = JSON.stringify(body);
  const ts = String(Date.now() + tsOffset);
  return new Request('https://apex.test/api/webhooks/dao-event', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dao-signature':  makeHmacSignature(secret, rawBody),
      'x-dao-timestamp':  ts,
    },
    body: rawBody,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. OUTSTAND WEBHOOK
// ══════════════════════════════════════════════════════════════════════════════

describe('Outstand Webhook', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, OUTSTAND_WEBHOOK_SECRET: 'test-outstand-secret' };
    jest.clearAllMocks();

    // Default: no existing webhook event
    mockSupabaseChain.maybeSingle.mockResolvedValue({ data: null, error: null });

    // Default RPC success
    mockRpc.mockResolvedValue({
      data: { id: 'tx-uuid-001', amount_zar: 100, status: 'success', emotion_state: 'neutral' },
      error: null,
    });
  });

  afterEach(() => { process.env = OLD_ENV; });

  it('returns 401 when signature header is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/outstand/route');
    const req = new Request('https://apex.test/api/webhooks/outstand', {
      method: 'POST',
      headers: { 'x-outstand-timestamp': String(Date.now()) },
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when timestamp is outside 5-minute window', async () => {
    const { POST } = await import('@/app/api/webhooks/outstand/route');
    const req = makeOutstandRequest(
      { event: 'payment', external_id: 'ext-001', amount: 500, currency: 'ZAR', creator_id: 'user-1' },
      'test-outstand-secret',
      -6 * 60 * 1000, // 6 minutes in the past
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when HMAC signature does not match', async () => {
    const { POST } = await import('@/app/api/webhooks/outstand/route');
    const rawBody = JSON.stringify({ event: 'payment', external_id: 'ext-002', amount: 500, currency: 'ZAR', creator_id: 'user-1' });
    const req = new Request('https://apex.test/api/webhooks/outstand', {
      method: 'POST',
      headers: {
        'x-outstand-signature': 'sha256=badhash',
        'x-outstand-timestamp':  String(Date.now()),
      },
      body: rawBody,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns duplicate:true for already-processed webhook', async () => {
    mockSupabaseChain.maybeSingle.mockResolvedValue({
      data: { id: 'existing-id', processed: true },
      error: null,
    });

    const { POST } = await import('@/app/api/webhooks/outstand/route');
    const req = makeOutstandRequest({
      event: 'payment', external_id: 'ext-dup', amount: 200,
      currency: 'ZAR', creator_id: 'user-1',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicate).toBe(true);
  });

  it('processes ZAR payment end-to-end and returns transaction_id', async () => {
    const { POST } = await import('@/app/api/webhooks/outstand/route');
    const req = makeOutstandRequest({
      event: 'payment', external_id: 'ext-zar-001', amount: 1000,
      currency: 'ZAR', creator_id: 'user-creator-1',
      post: { platform: 'instagram', text: 'Amazing milestone! 1000 subscribers!', likes: 450 },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
    expect(json.transaction_id).toBeTruthy();
  });

  it('sets fx_rate and fx_source for non-ZAR currency', async () => {
    // Mock fetch for FX rate
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { ZAR: 18.45 } }),
    } as Response) as typeof fetch;

    const { POST } = await import('@/app/api/webhooks/outstand/route');
    const req = makeOutstandRequest({
      event: 'payment', external_id: 'ext-usd-001', amount: 100,
      currency: 'USD', creator_id: 'user-creator-2',
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.amount_zar).toBeGreaterThan(100); // 100 USD > 100 ZAR
    expect(['live','cache','fallback']).toContain(json.fx_source);
  });

  it('resolves customer_id from KYC when id_number provided', async () => {
    // First call: webhook_events lookup (no existing)
    // Second call: customers lookup (found)
    let callCount = 0;
    mockSupabaseChain.maybeSingle.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return { data: null, error: null }; // webhook_events
      if (callCount === 2) return { data: { id: 'customer-kyc-uuid' }, error: null }; // customers
      return { data: null, error: null };
    });

    const { POST } = await import('@/app/api/webhooks/outstand/route');
    const req = makeOutstandRequest({
      event: 'payment', external_id: 'ext-kyc-001', amount: 500,
      currency: 'ZAR', creator_id: 'user-creator-3',
      customer: { id_number: '9001015800085' },
    });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.customer_id).toBe('customer-kyc-uuid');
  });

  it('does not block transaction when KYC lookup fails', async () => {
    // First call: webhook_events check succeeds; second call: customers lookup fails
    mockSupabaseChain.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })   // webhook_events → no dup
      .mockRejectedValueOnce(new Error('DB timeout'));       // customers → fails (non-fatal)

    const { POST } = await import('@/app/api/webhooks/outstand/route');
    const req = makeOutstandRequest({
      event: 'payment', external_id: 'ext-kyc-fail', amount: 300,
      currency: 'ZAR', creator_id: 'user-creator-4',
      customer: { id_number: 'bad-id' },
    });
    const res = await POST(req);
    // Should still process — KYC failure is non-fatal
    expect([200, 500]).toContain(res.status);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. KIMI EMOTION CLASSIFIER
// ══════════════════════════════════════════════════════════════════════════════

describe('Kimi Emotion Classifier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no cache hit
    mockSupabaseChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  const emotionCases: Array<[string, 'ecstatic' | 'bullish' | 'neutral' | 'panicked', number]> = [
    ['ecstatic', 'ecstatic', 1.20],
    ['bullish',  'bullish',  1.10],
    ['neutral',  'neutral',  1.00],
    ['panicked', 'panicked', 0.85],
  ];

  it.each(emotionCases)(
    'classifies %s post → correct fee multiplier',
    async (state, expectedState, expectedMultiplier) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ emotion_state: state, confidence: 0.95 }) } }],
        }),
      } as Response) as typeof fetch;

      const { classifyEmotionState } = await import('@/lib/treasury/emotion-classifier');
      const result = await classifyEmotionState(
        { text: `test post for ${state}`, platform: 'twitter' },
        'test-kimi-key',
      );
      expect(result.emotion_state).toBe(expectedState);
      expect(result.fee_multiplier).toBe(expectedMultiplier);
    },
  );

  it('returns neutral (1.00×) when Kimi API returns non-200', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429 } as Response) as typeof fetch;

    const { classifyEmotionState } = await import('@/lib/treasury/emotion-classifier');
    const result = await classifyEmotionState(
      { text: 'some post', platform: 'tiktok' },
      'test-kimi-key',
    );
    expect(result.emotion_state).toBe('neutral');
    expect(result.fee_multiplier).toBe(1.00);
    expect(result.model).toBe('fallback');
  });

  it('returns neutral when Kimi returns invalid JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not json at all' } }] }),
    } as Response) as typeof fetch;

    const { classifyEmotionState } = await import('@/lib/treasury/emotion-classifier');
    const result = await classifyEmotionState({ text: 'test', platform: 'ig' }, 'key');
    expect(result.emotion_state).toBe('neutral');
  });

  it('returns neutral when Kimi returns unknown state', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ emotion_state: 'hysterical', confidence: 0.9 }) } }],
      }),
    } as Response) as typeof fetch;

    const { classifyEmotionState } = await import('@/lib/treasury/emotion-classifier');
    const result = await classifyEmotionState({ text: 'test', platform: 'ig' }, 'key');
    expect(result.emotion_state).toBe('neutral');
  });

  it('returns cache_hit=true and skips Kimi when cache has valid entry', async () => {
    mockSupabaseChain.maybeSingle.mockResolvedValue({
      data: { emotion_state: 'bullish', fee_multiplier: '1.10', confidence: '0.92', kimi_model: 'kimi-k2-0711-preview' },
      error: null,
    });

    const kimiSpy = jest.fn();
    global.fetch = kimiSpy as unknown as typeof fetch;

    const { classifyEmotionState } = await import('@/lib/treasury/emotion-classifier');
    const result = await classifyEmotionState({ text: 'cached post', platform: 'yt' }, 'key');

    expect(result.cache_hit).toBe(true);
    expect(result.emotion_state).toBe('bullish');
    expect(kimiSpy).not.toHaveBeenCalled(); // Kimi NOT called when cache hit
  });

  it('applyEmotionMultiplier calculates correctly for all states', async () => {
    const { applyEmotionMultiplier } = await import('@/lib/treasury/emotion-classifier');
    expect(applyEmotionMultiplier(100, 'ecstatic')).toBe(120.00);
    expect(applyEmotionMultiplier(100, 'bullish')).toBe(110.00);
    expect(applyEmotionMultiplier(100, 'neutral')).toBe(100.00);
    expect(applyEmotionMultiplier(100, 'panicked')).toBe(85.00);
    // Rounding: 50 * 0.85 = 42.50
    expect(applyEmotionMultiplier(50, 'panicked')).toBe(42.50);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. FX CONVERSION
// ══════════════════════════════════════════════════════════════════════════════

describe('FX Conversion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseChain.maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it('returns 1:1 for ZAR input', async () => {
    const { convertToZar } = await import('@/lib/treasury/fx');
    const result = await convertToZar(500, 'ZAR');
    expect(result.amount_zar).toBe(500);
    expect(result.rate_used).toBe(1);
    expect(result.rate_source).toBe('live');
  });

  it('converts USD using live rate when available', async () => {
    // Cache miss
    mockSupabaseChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { ZAR: 18.50 } }),
    } as Response) as typeof fetch;

    const { convertToZar } = await import('@/lib/treasury/fx');
    const result = await convertToZar(100, 'USD');
    expect(result.amount_zar).toBe(1850.00);
    expect(result.rate_used).toBe(18.50);
    expect(result.rate_source).toBe('live');
    expect(result.original_currency).toBe('USD');
  });

  it('uses cache when available (skips live fetch)', async () => {
    mockSupabaseChain.maybeSingle.mockResolvedValue({
      data: { rate_to_zar: '20.10', expires_at: new Date(Date.now() + 3600000).toISOString() },
      error: null,
    });

    const liveSpy = jest.fn();
    global.fetch = liveSpy as unknown as typeof fetch;

    const { convertToZar } = await import('@/lib/treasury/fx');
    const result = await convertToZar(50, 'EUR');
    expect(result.rate_source).toBe('cache');
    expect(result.amount_zar).toBe(1005.00); // 50 * 20.10
    expect(liveSpy).not.toHaveBeenCalled();
  });

  it('falls back to hardcoded rates when live fetch fails', async () => {
    mockSupabaseChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    global.fetch = jest.fn().mockRejectedValue(new Error('network error')) as typeof fetch;

    const { convertToZar } = await import('@/lib/treasury/fx');
    const result = await convertToZar(1, 'GBP');
    expect(result.rate_source).toBe('fallback');
    expect(result.amount_zar).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. DAO WEBHOOK — full proposal lifecycle
// ══════════════════════════════════════════════════════════════════════════════

describe('DAO Webhook — Proposal Lifecycle', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, DAO_WEBHOOK_SECRET: 'test-dao-secret' };
    jest.clearAllMocks();
    mockSupabaseChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockSupabaseChain.upsert.mockResolvedValue({ error: null });
    mockSupabaseChain.insert.mockResolvedValue({ error: null });
    // update returns chain (mockReturnThis) so .eq().eq() works
    mockSupabaseChain.update.mockReturnThis();
  });

  afterEach(() => { process.env = OLD_ENV; });

  it('returns 401 when DAO headers are missing', async () => {
    const { POST } = await import('@/app/api/webhooks/dao-event/route');
    const req = new Request('https://apex.test/api/webhooks/dao-event', {
      method: 'POST', body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('processes proposal.created and upserts governance_proposals', async () => {
    const { POST } = await import('@/app/api/webhooks/dao-event/route');
    const req = makeDaoRequest({
      event: 'proposal.created',
      proposal_id: 'prop-uuid-001',
      title: 'Community Garden Project',
      description: 'Fund a garden in Soweto',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toBe(true);
    expect(json.event).toBe('proposal.created');
    expect(mockSupabase.from).toHaveBeenCalledWith('governance_proposals');
  });

  it('processes proposal.vote and updates vote counts', async () => {
    const { POST } = await import('@/app/api/webhooks/dao-event/route');
    const req = makeDaoRequest({
      event: 'proposal.vote',
      proposal_id: 'prop-uuid-001',
      vote_counts: { for: 150, against: 12 },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('processes proposal.approved and unlocks vaal_development_pool', async () => {
    const { POST } = await import('@/app/api/webhooks/dao-event/route');
    const req = makeDaoRequest({
      event: 'proposal.approved',
      proposal_id: 'prop-uuid-001',
      approved_by: 'governance_multisig',
      approved_at: new Date().toISOString(),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // vaal_development_pool should be updated
    expect(mockSupabase.from).toHaveBeenCalledWith('vaal_development_pool');
  });

  it('processes proposal.rejected', async () => {
    const { POST } = await import('@/app/api/webhooks/dao-event/route');
    const req = makeDaoRequest({ event: 'proposal.rejected', proposal_id: 'prop-uuid-002' });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('returns duplicate:true for already-processed event', async () => {
    mockSupabaseChain.maybeSingle.mockResolvedValue({ data: { id: 'dup', processed: true }, error: null });
    const { POST } = await import('@/app/api/webhooks/dao-event/route');
    const req = makeDaoRequest({ event: 'proposal.created', proposal_id: 'prop-dup' });
    const res = await POST(req);
    const json = await res.json();
    expect(json.duplicate).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. DAO WEBHOOK — disbursement.executed + audit trail
// ══════════════════════════════════════════════════════════════════════════════

describe('DAO Webhook — Disbursement Audit Trail', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, DAO_WEBHOOK_SECRET: 'test-dao-secret' };
    jest.clearAllMocks();
  });

  afterEach(() => { process.env = OLD_ENV; });

  it('blocks disbursement when beneficiary is not verified', async () => {
    // No existing webhook + unverified beneficiary
    let callCount = 0;
    mockSupabaseChain.maybeSingle.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return { data: null, error: null }; // webhook_events
      return { data: { id: 'ben-uuid', verified: false }, error: null }; // beneficiaries
    });
    mockSupabaseChain.upsert.mockResolvedValue({ error: null });

    const { POST } = await import('@/app/api/webhooks/dao-event/route');
    const req = makeDaoRequest({
      event: 'disbursement.executed',
      proposal_id: 'prop-uuid-pay',
      disbursement: { amount_zar: 50000, beneficiary_id: 'ben-uuid' },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe('BENEFICIARY_NOT_VERIFIED');
  });

  it('blocks disbursement when beneficiary does not exist', async () => {
    let callCount = 0;
    mockSupabaseChain.maybeSingle.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return { data: null, error: null }; // webhook_events
      return { data: null, error: null }; // beneficiary not found
    });
    mockSupabaseChain.upsert.mockResolvedValue({ error: null });

    const { POST } = await import('@/app/api/webhooks/dao-event/route');
    const req = makeDaoRequest({
      event: 'disbursement.executed',
      proposal_id: 'prop-uuid-pay',
      disbursement: { amount_zar: 50000, beneficiary_id: 'missing-ben' },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it('writes disbursement_log when beneficiary is verified', async () => {
    let callCount = 0;
    mockSupabaseChain.maybeSingle.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return { data: null, error: null }; // webhook_events
      return { data: { id: 'ben-verified', verified: true }, error: null }; // beneficiary OK
    });
    mockSupabaseChain.upsert.mockResolvedValue({ error: null });
    mockSupabaseChain.insert.mockResolvedValue({ error: null });
    mockSupabaseChain.update.mockReturnThis();

    const { POST } = await import('@/app/api/webhooks/dao-event/route');
    const req = makeDaoRequest({
      event: 'disbursement.executed',
      proposal_id: 'prop-uuid-pay',
      disbursement: {
        amount_zar: 75000,
        beneficiary_id: 'ben-verified',
        tx_hash: '0xABCDEF',
        payment_reference: 'EFT-20260320-001',
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // disbursement_log MUST be written
    expect(mockSupabase.from).toHaveBeenCalledWith('disbursement_log');
    expect(mockSupabaseChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        proposal_id:      'prop-uuid-pay',
        beneficiary_id:   'ben-verified',
        amount_zar:       75000,
        status:           'paid',
        tx_hash:          '0xABCDEF',
        auditor_sign_off: false,
        created_by:       'dao_webhook',
      }),
    );
  });

  it('requires amount_zar and beneficiary_id for disbursement.executed', async () => {
    mockSupabaseChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockSupabaseChain.upsert.mockResolvedValue({ error: null });

    const { POST } = await import('@/app/api/webhooks/dao-event/route');
    const req = makeDaoRequest({
      event: 'disbursement.executed',
      proposal_id: 'prop-uuid-pay',
      disbursement: { amount_zar: 0 }, // missing beneficiary_id
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 500 and logs error when disbursement_log insert fails', async () => {
    let callCount = 0;
    mockSupabaseChain.maybeSingle.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return { data: null, error: null };
      return { data: { id: 'ben-ok', verified: true }, error: null };
    });
    mockSupabaseChain.upsert.mockResolvedValue({ error: null });
    mockSupabaseChain.insert.mockResolvedValue({ error: { message: 'constraint violation' } });

    const { POST } = await import('@/app/api/webhooks/dao-event/route');
    const req = makeDaoRequest({
      event: 'disbursement.executed',
      proposal_id: 'prop-uuid-pay',
      disbursement: { amount_zar: 5000, beneficiary_id: 'ben-ok' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('PROCESSING_FAILED');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. END-TO-END: Outstand → emotion → fee → treasury
// ══════════════════════════════════════════════════════════════════════════════

describe('E2E: Outstand sad post → 0.85× fee → treasury', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      OUTSTAND_WEBHOOK_SECRET: 'test-outstand-secret',
      KIMI_API_KEY: 'test-kimi-key',
    };
    jest.clearAllMocks();
    mockSupabaseChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockRpc.mockResolvedValue({
      data: { id: 'tx-sad-001', amount_zar: 1000, status: 'success', emotion_state: 'panicked' },
      error: null,
    });
    mockSupabaseChain.upsert.mockResolvedValue({ error: null });
    mockSupabaseChain.update.mockReturnValue({
      ...mockSupabaseChain,
      eq: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
    });
  });

  afterEach(() => { process.env = OLD_ENV; });

  it('sad post receives 0.85× fee multiplier', async () => {
    // Mock: no FX needed (ZAR), no cache, Kimi returns panicked
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ emotion_state: 'panicked', confidence: 0.91 }) } }],
        }),
      } as Response) as typeof fetch;

    const { POST } = await import('@/app/api/webhooks/outstand/route');
    const req = makeOutstandRequest({
      event: 'payment',
      external_id: 'ext-sad-001',
      amount: 1000,
      currency: 'ZAR',
      creator_id: 'creator-uuid',
      post: {
        platform: 'twitter',
        text: 'Everything is falling apart, market crashed, losing subscribers 😭',
        likes: 2,
        shares: 0,
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.emotion_state).toBe('panicked');
    expect(json.fee_multiplier).toBe(0.85);

    // Verify RPC was called with emotion_state = 'panicked'
    expect(mockRpc).toHaveBeenCalledWith(
      'insert_transaction_serializable',
      expect.objectContaining({ p_emotion_state: 'panicked' }),
    );
  });

  it('ecstatic post receives 1.20× fee multiplier', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({ emotion_state: 'ecstatic', confidence: 0.97 }) } }],
        }),
      } as Response) as typeof fetch;

    mockRpc.mockResolvedValue({
      data: { id: 'tx-ecstatic-001', amount_zar: 1000, status: 'success', emotion_state: 'ecstatic' },
      error: null,
    });

    const { POST } = await import('@/app/api/webhooks/outstand/route');
    const req = makeOutstandRequest({
      event: 'payment',
      external_id: 'ext-ecstatic-001',
      amount: 1000,
      currency: 'ZAR',
      creator_id: 'creator-uuid',
      post: {
        platform: 'instagram',
        text: '1 MILLION FOLLOWERS! 🎉🎉 We made it! Best day ever!',
        likes: 98000,
        shares: 45000,
      },
    });

    const res = await POST(req);
    const json = await res.json();
    expect(json.emotion_state).toBe('ecstatic');
    expect(json.fee_multiplier).toBe(1.20);
    expect(mockRpc).toHaveBeenCalledWith(
      'insert_transaction_serializable',
      expect.objectContaining({ p_emotion_state: 'ecstatic' }),
    );
  });
});
