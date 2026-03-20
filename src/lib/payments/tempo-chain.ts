/**
 * Tempo Blockchain — Chain Config & viem Utilities
 *
 * Tempo mainnet launched March 18, 2026.
 * EVM-compatible (Osaka hardfork). No native gas token — fees paid in TIP-20 stablecoins.
 *
 * Official chain details (from mppx/node_modules + docs.tempo.xyz):
 *   Mainnet  Chain ID: 4217   RPC: https://rpc.tempo.xyz
 *   Testnet  Chain ID: 42431  RPC: https://rpc.moderato.tempo.xyz
 *
 * TIP-20 tokens (protocol-enshrined, 6 decimals):
 *   USDC  (mainnet default): 0x20C000000000000000000000b9537d11c60E8b50
 *   pathUSD (testnet default): 0x20c0000000000000000000000000000000000000
 *
 * Session escrow contract (TempoStreamChannel):
 *   Mainnet: 0x33b901018174DDabE4841042ab76ba85D4e24f25
 *   Testnet: 0xe1c4d3dce17bc111181ddf716f75bae49e61a336
 */

import { createPublicClient, defineChain, http } from 'viem';

// ─── Chain definitions ─────────────────────────────────────────────────────────

export const tempoMainnet = defineChain({
  id:   4217,
  name: 'Tempo',
  nativeCurrency: {
    // Tempo has no real native token; this placeholder keeps EVM wallets happy.
    name: 'Tempo', symbol: 'TEMPO', decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.tempo.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Tempo Explorer', url: 'https://explore.mainnet.tempo.xyz' },
  },
});

export const tempoTestnet = defineChain({
  id:   42431,
  name: 'Tempo Testnet (Moderato)',
  nativeCurrency: { name: 'Tempo', symbol: 'TEMPO', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.moderato.tempo.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Tempo Testnet Explorer', url: 'https://explore.testnet.tempo.xyz' },
  },
  testnet: true,
});

// ─── Environment-aware defaults ───────────────────────────────────────────────

const isMainnet = process.env.TEMPO_NETWORK === 'mainnet'
  || process.env.NODE_ENV === 'production';

export const tempoChain   = isMainnet ? tempoMainnet : tempoTestnet;
export const tempoChainId = isMainnet ? 4217 : 42431;

// ─── TIP-20 token addresses (6 decimals) ─────────────────────────────────────

export const TIP20 = {
  /** USDC.e — mainnet default payment token for MPP */
  USDC:    '0x20C000000000000000000000b9537d11c60E8b50' as `0x${string}`,
  /** pathUSD — testnet default payment token */
  pathUSD: '0x20c0000000000000000000000000000000000000' as `0x${string}`,
} as const;

/** Returns the correct default token for the current environment */
export const defaultToken = isMainnet ? TIP20.USDC : TIP20.pathUSD;

// ─── Protocol contract addresses ──────────────────────────────────────────────

export const TEMPO_CONTRACTS = {
  mainnet: {
    /** TempoStreamChannel — payment channel escrow for MPP sessions */
    streamChannel: '0x33b901018174DDabE4841042ab76ba85D4e24f25' as `0x${string}`,
  },
  testnet: {
    streamChannel: '0xe1c4d3dce17bc111181ddf716f75bae49e61a336' as `0x${string}`,
  },
} as const;

export const streamChannelAddress = isMainnet
  ? TEMPO_CONTRACTS.mainnet.streamChannel
  : TEMPO_CONTRACTS.testnet.streamChannel;

// ─── viem public client ───────────────────────────────────────────────────────

export const tempoClient = createPublicClient({
  chain:     tempoChain,
  transport: http(tempoChain.rpcUrls.default.http[0]),
});

// ─── Minimal TIP-20 ABI (ERC-20 compatible) ──────────────────────────────────

export const TIP20_ABI = [
  {
    name: 'balanceOf', type: 'function' as const,
    inputs: [{ name: 'account', type: 'address' as const }],
    outputs: [{ name: '', type: 'uint256' as const }],
    stateMutability: 'view' as const,
  },
  {
    name: 'decimals', type: 'function' as const,
    inputs: [],
    outputs: [{ name: '', type: 'uint8' as const }],
    stateMutability: 'view' as const,
  },
  {
    name: 'symbol', type: 'function' as const,
    inputs: [],
    outputs: [{ name: '', type: 'string' as const }],
    stateMutability: 'view' as const,
  },
] as const;

// ─── Utility: TIP-20 balance query ───────────────────────────────────────────

export async function getTip20Balance(
  tokenAddress: `0x${string}`,
  walletAddress: `0x${string}`,
): Promise<{ raw: bigint; formatted: string }> {
  const [raw] = await Promise.all([
    tempoClient.readContract({
      address: tokenAddress,
      abi:     TIP20_ABI,
      functionName: 'balanceOf',
      args:    [walletAddress],
    }),
  ]);
  // TIP-20 always uses 6 decimals on Tempo
  const divisor = BigInt(1_000_000);  // 10^6
  const whole   = raw / divisor;
  const frac    = raw % divisor;
  return { raw, formatted: `${whole}.${frac.toString().padStart(6, '0')}` };
}

// ─── Utility: Tempo node liveness check ──────────────────────────────────────

export async function getTempoBlockNumber(): Promise<bigint | null> {
  try {
    return await tempoClient.getBlockNumber();
  } catch {
    return null;
  }
}
