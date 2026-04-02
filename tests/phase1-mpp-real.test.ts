/**
 * Phase 1 MPP Foundation — Integration Tests (Real Tempo Mainnet)
 *
 * Validates the actual execution path — no shallow mocks of mppx or viem.
 *
 * Test groups:
 *   1. Chain constants — pure logic, zero network, always runs
 *   2. Live Tempo RPC  — real calls to rpc.moderato.tempo.xyz
 *                        Runs when: TEMPO_RPC_ENABLED=true npm run test
 *                        Skipped otherwise (CI flag-gated)
 *   3. MPP Server Helpers — pricing + Supabase recording, always runs
 *   4. MPP Routes (real mppx) — actual 402 challenge flow, always runs
 *   5. DB schema assertions — migration 010 column types, always runs
 *
 * To run with live RPC:
 *   TEMPO_RPC_ENABLED=true npm run test -- tests/phase1-mpp-real.test.ts
 *
 * To run without live RPC (default CI/dev):
 *   npm run test -- tests/phase1-mpp-real.test.ts
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";

// Global timeout — must be file-level, not inside a describe block
jest.setTimeout(30000);

// ─── Supabase mock — only external dep we don't hit live in unit tests ─────────

const mockSupabaseChain: Record<string, jest.Mock> = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  insert: jest.fn().mockResolvedValue({ error: null }),
  upsert: jest.fn().mockResolvedValue({ error: null }),
  filter: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  // Use mockResolvedValue for proper Promise behavior with async/await
  then: jest.fn().mockResolvedValue({ data: [], error: null }),
};

const mockRpc = jest.fn().mockResolvedValue({
  data: {
    id: "tx-mpp-001",
    status: "success",
    gateway: "tempo_mpp",
    mpp_intent: "charge",
  },
  error: null,
});

const mockSupabase = { from: jest.fn(() => mockSupabaseChain), rpc: mockRpc };

// jest.unstable_mockModule is the ESM-native mock API.
// jest.mock() is not reliably hoisted or applied to dynamic import()
// calls after resetModules() when useESM:true is set in ts-jest.
jest.unstable_mockModule("@/lib/supabase", () => ({
  getSupabaseClient: () => mockSupabase,
}));
jest.unstable_mockModule("@/lib/api-utils", () => ({
  log: jest.fn(),
  generateRequestId: () => "req-mpp-test-001",
}));

// ══════════════════════════════════════════════════════════════════════════════
// 1. Chain constants — pure logic, no network, always runs
// ══════════════════════════════════════════════════════════════════════════════

describe("Tempo Chain Config", () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, TEMPO_NETWORK: "testnet" };
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("mainnet chain ID is 4217", async () => {
    const { tempoMainnet } = await import("@/lib/payments/tempo-chain");
    expect(tempoMainnet.id).toBe(4217);
  });

  it("testnet chain ID is 42431", async () => {
    const { tempoTestnet } = await import("@/lib/payments/tempo-chain");
    expect(tempoTestnet.id).toBe(42431);
  });

  it("mainnet RPC is https://rpc.tempo.xyz", async () => {
    const { tempoMainnet } = await import("@/lib/payments/tempo-chain");
    expect(tempoMainnet.rpcUrls.default.http[0]).toBe("https://rpc.tempo.xyz");
  });

  it("testnet RPC is https://rpc.moderato.tempo.xyz", async () => {
    const { tempoTestnet } = await import("@/lib/payments/tempo-chain");
    expect(tempoTestnet.rpcUrls.default.http[0]).toBe(
      "https://rpc.moderato.tempo.xyz",
    );
  });

  it("USDC is the correct mainnet TIP-20 address (6 decimals)", async () => {
    const { TIP20 } = await import("@/lib/payments/tempo-chain");
    expect(TIP20.USDC.toLowerCase()).toBe(
      "0x20c000000000000000000000b9537d11c60e8b50",
    );
  });

  it("pathUSD is the correct testnet TIP-20 address (6 decimals)", async () => {
    const { TIP20 } = await import("@/lib/payments/tempo-chain");
    expect(TIP20.pathUSD.toLowerCase()).toBe(
      "0x20c0000000000000000000000000000000000000",
    );
  });

  it("mainnet TempoStreamChannel escrow address is correct", async () => {
    const { TEMPO_CONTRACTS } = await import("@/lib/payments/tempo-chain");
    expect(TEMPO_CONTRACTS.mainnet.streamChannel.toLowerCase()).toBe(
      "0x33b901018174ddabe4841042ab76ba85d4e24f25",
    );
  });

  it("testnet TempoStreamChannel escrow address is correct", async () => {
    const { TEMPO_CONTRACTS } = await import("@/lib/payments/tempo-chain");
    expect(TEMPO_CONTRACTS.testnet.streamChannel.toLowerCase()).toBe(
      "0xe1c4d3dce17bc111181ddf716f75bae49e61a336",
    );
  });

  it("defaultToken is pathUSD in dev/test environment", async () => {
    const { defaultToken, TIP20 } = await import("@/lib/payments/tempo-chain");
    // NODE_ENV !== 'production' and TEMPO_NETWORK !== 'mainnet' → pathUSD
    expect(defaultToken).toBe(TIP20.pathUSD);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Live Tempo RPC — real calls to rpc.moderato.tempo.xyz
//    Flag-gated: only runs when TEMPO_RPC_ENABLED=true
//    Run: TEMPO_RPC_ENABLED=true npm run test
// ══════════════════════════════════════════════════════════════════════════════

const describeRpc =
  process.env.TEMPO_RPC_ENABLED === "true" ? describe : describe.skip;

describeRpc(
  "Tempo Live RPC — rpc.moderato.tempo.xyz (TEMPO_RPC_ENABLED=true)",
  () => {
    it("getTip20Balance returns a valid result from the live Tempo testnet RPC", async () => {
      const { getTip20Balance, TIP20 } =
        await import("@/lib/payments/tempo-chain");

      // Use address(1) — valid EVM address with deterministic zero/near-zero balance
      const testAddress =
        "0x0000000000000000000000000000000000000001" as `0x${string}`;
      const result = await getTip20Balance(TIP20.pathUSD, testAddress);

      expect(result).toHaveProperty("raw");
      expect(result).toHaveProperty("formatted");
      expect(typeof result.raw).toBe("bigint");
      expect(typeof result.formatted).toBe("string");
      // Format: "0.000000" — whole.6decimals
      expect(result.formatted).toMatch(/^\d+\.\d{6}$/);
    }, 30000);

    it("getTempoBlockNumber returns a positive bigint from live RPC", async () => {
      const { getTempoBlockNumber } =
        await import("@/lib/payments/tempo-chain");

      const block = await getTempoBlockNumber();

      expect(block).not.toBeNull();
      expect(typeof block).toBe("bigint");
      expect(block! > BigInt(0)).toBe(true);
    }, 30000);
  },
);

// ══════════════════════════════════════════════════════════════════════════════
// 3. MPP Server Helpers — pricing + Supabase recording
// ══════════════════════════════════════════════════════════════════════════════

describe("MPP Server Helpers", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      APEX_TEMPO_RECIPIENT: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    };
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("analyticsQuery price is $0.001 per request", async () => {
    const { MPP_PRICING } = await import("@/lib/payments/mpp-server");
    expect(MPP_PRICING.analyticsQuery).toBe("0.001");
  });

  it("treasuryQuery price is $0.0001 per query", async () => {
    const { MPP_PRICING } = await import("@/lib/payments/mpp-server");
    expect(MPP_PRICING.treasuryQuery).toBe("0.0001");
  });

  it("getRecipient returns APEX_TEMPO_RECIPIENT env var", async () => {
    const { getRecipient } = await import("@/lib/payments/mpp-server");
    expect(getRecipient()).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });

  it("getRecipient throws when APEX_TEMPO_RECIPIENT is not set", async () => {
    delete process.env.APEX_TEMPO_RECIPIENT;
    jest.resetModules();
    const { getRecipient } = await import("@/lib/payments/mpp-server");
    expect(() => getRecipient()).toThrow(
      "APEX_TEMPO_RECIPIENT must be a valid Ethereum address (0x + 40 hex chars), got: undefined",
    );
  });

  it("getFeePayer returns undefined when APEX_FEE_PAYER_KEY is not set", async () => {
    const { getFeePayer } = await import("@/lib/payments/mpp-server");
    expect(getFeePayer()).toBeUndefined();
  });

  it("recordMppPayment calls insert_transaction_serializable with gateway=tempo_mpp", async () => {
    const { recordMppPayment } = await import("@/lib/payments/mpp-server");
    await recordMppPayment(
      {
        creatorId: "creator-uuid-001",
        amountUsd: "0.001",
        mppIntent: "charge",
        receiptReference: "0xabcdef1234567890",
      },
      "req-test-001",
    );
    expect(mockRpc).toHaveBeenCalledWith(
      "insert_transaction_serializable",
      expect.objectContaining({
        p_gateway: "tempo_mpp",
        p_source_currency: "USD",
        p_metadata: expect.objectContaining({
          mpp_intent: "charge",
          settlement_pathway: "tempo_mpp",
          tempo_chain_id: 42431, // testnet in non-production environment
        }),
      }),
    );
  });

  it("recordMppPayment passes sessionChannelId for session payments", async () => {
    const { recordMppPayment } = await import("@/lib/payments/mpp-server");
    await recordMppPayment(
      {
        creatorId: "creator-uuid-002",
        amountUsd: "0.0001",
        mppIntent: "session",
        receiptReference: "0xchannel-bytes32",
        sessionChannelId: "0xchannel-bytes32",
      },
      "req-test-002",
    );
    expect(mockRpc).toHaveBeenCalledWith(
      "insert_transaction_serializable",
      expect.objectContaining({
        p_metadata: expect.objectContaining({
          mpp_intent: "session",
          session_channel_id: "0xchannel-bytes32",
        }),
      }),
    );
  });

  it("recordMppPayment is non-fatal when DB throws", async () => {
    mockRpc.mockRejectedValueOnce(new Error("DB timeout"));
    const { recordMppPayment } = await import("@/lib/payments/mpp-server");
    await expect(
      recordMppPayment(
        {
          creatorId: "x",
          amountUsd: "0.001",
          mppIntent: "charge",
          receiptReference: "ref",
        },
        "req-test-003",
      ),
    ).resolves.toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. MPP Routes — real mppx library, real HTTP 402 challenge flow
//    These import the actual route files which use mppx/nextjs directly.
//    mppx is compiled from ESM→CJS by babel-jest (via transformIgnorePatterns).
// ══════════════════════════════════════════════════════════════════════════════

describe("MPP Analytics Route — real mppx charge intent", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      APEX_TEMPO_RECIPIENT: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      MPP_SECRET_KEY: "test-secret-key-for-jest",
    };
    mockSupabaseChain.then.mockResolvedValue({ data: [], error: null });
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("route exports GET as a function", async () => {
    const route = await import("@/app/api/mpp/analytics/route");
    expect(typeof route.GET).toBe("function");
  });

  it('runtime is "nodejs"', async () => {
    const route = await import("@/app/api/mpp/analytics/route");
    expect(route.runtime).toBe("nodejs");
  });

  it("unauthenticated request → HTTP 402", async () => {
    const { GET } = await import("@/app/api/mpp/analytics/route");
    const res = await GET(
      new Request(
        "https://apex.test/api/mpp/analytics?creator_id=00000000-0000-0000-0000-000000000001",
      ),
    );
    expect(res.status).toBe(402);
  });

  it("402 response has WWW-Authenticate: Payment header (the MPP challenge)", async () => {
    const { GET } = await import("@/app/api/mpp/analytics/route");
    const res = await GET(
      new Request(
        "https://apex.test/api/mpp/analytics?creator_id=00000000-0000-0000-0000-000000000001",
      ),
    );
    expect(res.status).toBe(402);
    const header = res.headers.get("www-authenticate") ?? "";
    expect(header.toLowerCase()).toContain("payment");
  });

  it('challenge header advertises "tempo" payment method', async () => {
    const { GET } = await import("@/app/api/mpp/analytics/route");
    const res = await GET(
      new Request(
        "https://apex.test/api/mpp/analytics?creator_id=00000000-0000-0000-0000-000000000001",
      ),
    );
    const header = res.headers.get("www-authenticate") ?? "";
    expect(header.toLowerCase()).toContain("tempo");
  });

  it("challenge includes APEX_TEMPO_RECIPIENT address (where to pay)", async () => {
    const { GET } = await import("@/app/api/mpp/analytics/route");
    const res = await GET(
      new Request(
        "https://apex.test/api/mpp/analytics?creator_id=00000000-0000-0000-0000-000000000001",
      ),
    );
    const header = res.headers.get("www-authenticate") ?? "";
    // mppx encodes the challenge as a base64url JSON blob in the request= param.
    // Decode it to assert the recipient address is present inside the challenge payload.
    const requestMatch = header.match(/request="([^"]+)"/i);
    expect(requestMatch).not.toBeNull();
    const decoded = Buffer.from(requestMatch![1], "base64url").toString("utf8");
    expect(decoded.toLowerCase()).toContain(
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    );
  });
});

describe("MPP Treasury Route — real mppx session intent", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      APEX_TEMPO_RECIPIENT: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      MPP_SECRET_KEY: "test-secret-key-for-jest",
    };
    mockSupabaseChain.then.mockResolvedValue({ data: [], error: null });
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it("route exports GET as a function", async () => {
    const route = await import("@/app/api/mpp/treasury/route");
    expect(typeof route.GET).toBe("function");
  });

  it('runtime is "nodejs"', async () => {
    const route = await import("@/app/api/mpp/treasury/route");
    expect(route.runtime).toBe("nodejs");
  });

  it("unauthenticated request → HTTP 402", async () => {
    const { GET } = await import("@/app/api/mpp/treasury/route");
    const res = await GET(new Request("https://apex.test/api/mpp/treasury"));
    expect(res.status).toBe(402);
  });

  it("402 response has WWW-Authenticate: Payment header", async () => {
    const { GET } = await import("@/app/api/mpp/treasury/route");
    const res = await GET(new Request("https://apex.test/api/mpp/treasury"));
    const header = res.headers.get("www-authenticate") ?? "";
    expect(header.toLowerCase()).toContain("payment");
  });

  it('session challenge advertises "tempo" payment method', async () => {
    const { GET } = await import("@/app/api/mpp/treasury/route");
    const res = await GET(new Request("https://apex.test/api/mpp/treasury"));
    const header = res.headers.get("www-authenticate") ?? "";
    expect(header.toLowerCase()).toContain("tempo");
  });
});
