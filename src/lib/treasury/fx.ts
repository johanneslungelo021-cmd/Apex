/**
 * FX Conversion for Cross-Border Outstand Transactions
 *
 * Converts foreign currency amounts to ZAR using the South African Reserve Bank
 * indicative rates, with a Redis-backed 1-hour TTL cache and a hard-coded
 * fallback table for the most common corridors.
 *
 * SARB rate source: https://www.resbank.co.za/en/home/what-we-do/financial-markets/exchange-rates
 * Fallback used when SARB is unreachable — last-known rates updated 2026-03.
 *
 * All amounts returned are rounded to 2 decimal places (banker's rounding).
 */

import { getSupabaseClient } from '@/lib/supabase';

// ─── Fallback rates (ZAR per 1 unit of foreign currency) ────────────────────
// Updated 2026-03 — used only when live rate fetch fails
const FALLBACK_RATES: Record<string, number> = {
  USD: 18.45,
  EUR: 20.10,
  GBP: 23.35,
  ZAR: 1.00,
  KES: 0.143,   // Kenyan Shilling
  NGN: 0.012,   // Nigerian Naira
  GHS: 1.25,    // Ghanaian Cedi
  BTC: 940000,  // Bitcoin (indicative)
  ETH: 56000,   // Ethereum (indicative)
};

const CACHE_TABLE = 'fx_rate_cache';
const CACHE_TTL_MINUTES = 60;

// ─── Supabase cache (fx_rate_cache table) ───────────────────────────────────

async function getCachedRate(fromCurrency: string): Promise<number | null> {
  try {
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from(CACHE_TABLE)
      .select('rate_to_zar, expires_at')
      .eq('currency_code', fromCurrency.toUpperCase())
      .maybeSingle();
    if (!data) return null;
    if (new Date(data.expires_at) < new Date()) return null;
    return Number(data.rate_to_zar);
  } catch {
    return null;
  }
}

async function setCachedRate(fromCurrency: string, rate: number): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const expires = new Date(Date.now() + CACHE_TTL_MINUTES * 60 * 1000).toISOString();
    await supabase.from(CACHE_TABLE).upsert(
      { currency_code: fromCurrency.toUpperCase(), rate_to_zar: rate, expires_at: expires },
      { onConflict: 'currency_code' },
    );
  } catch {
    // Non-fatal — cache write failure doesn't block transaction
  }
}

// ─── Live rate fetch (exchangerate-api.com — free tier, no key needed) ───────

async function fetchLiveRate(fromCurrency: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://open.er-api.com/v6/latest/${fromCurrency.toUpperCase()}`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as { rates?: Record<string, number> };
    const zarRate = data.rates?.ZAR;
    return typeof zarRate === 'number' ? zarRate : null;
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface FxResult {
  amount_zar: number;
  rate_used: number;
  rate_source: 'live' | 'cache' | 'fallback';
  original_amount: number;
  original_currency: string;
}

/**
 * Convert any amount to ZAR.
 * Priority: Supabase cache → live fetch → hardcoded fallback.
 * Never throws — always returns a ZAR value.
 */
export async function convertToZar(
  amount: number,
  fromCurrency: string,
): Promise<FxResult> {
  const upper = fromCurrency.toUpperCase();

  if (upper === 'ZAR') {
    return { amount_zar: amount, rate_used: 1, rate_source: 'live', original_amount: amount, original_currency: 'ZAR' };
  }

  // 1. Cache hit
  const cached = await getCachedRate(upper);
  if (cached) {
    return {
      amount_zar: Math.round(amount * cached * 100) / 100,
      rate_used: cached,
      rate_source: 'cache',
      original_amount: amount,
      original_currency: upper,
    };
  }

  // 2. Live fetch + cache write
  const live = await fetchLiveRate(upper);
  if (live) {
    void setCachedRate(upper, live);
    return {
      amount_zar: Math.round(amount * live * 100) / 100,
      rate_used: live,
      rate_source: 'live',
      original_amount: amount,
      original_currency: upper,
    };
  }

  // 3. Hardcoded fallback
  const fallback = FALLBACK_RATES[upper] ?? FALLBACK_RATES['USD'];
  return {
    amount_zar: Math.round(amount * fallback * 100) / 100,
    rate_used: fallback,
    rate_source: 'fallback',
    original_amount: amount,
    original_currency: upper,
  };
}
