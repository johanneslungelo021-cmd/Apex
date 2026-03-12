export const runtime = 'nodejs';

/**
 * Trading API — Real ZAR market data via Perplexity Sonar
 *
 * Fetches live: ZAR/USD rate, JSE top movers, BTC/ETH in ZAR, XRPL price.
 * 10-minute cache to balance freshness vs API cost.
 */

import { NextResponse } from 'next/server';
import { log, generateRequestId, fetchWithTimeout } from '@/lib/api-utils';
import { checkRateLimit } from '@/lib/api-utils';
import { departmentRateLimitCounter } from '@/lib/observability/pillar4Metrics';

const SERVICE = 'trading-api';
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface TradingData {
  zarUsd: number;
  zarUsdChange24h: number;
  btcZar: number;
  ethZar: number;
  xrpZar: number;
  jseAlsi: number;
  jseAlsiChange: number;
  topMovers: { name: string; ticker: string; price: number; change: number }[];
  updatedAt: string;
  source: string;
}

let cache: { data: TradingData; cachedAt: number } | null = null;

async function fetchTradingData(requestId: string): Promise<TradingData> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY not set');

  const today = new Date().toISOString().split('T')[0];

  const response = await fetchWithTimeout(
    'https://api.perplexity.ai/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        max_tokens: 800,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              'You are a financial data API. Search for current live market data and return ONLY a valid JSON object — no markdown, no code fences, no explanation. ' +
              'The JSON must have exactly these keys: ' +
              '"zarUsd" (number, current ZAR per 1 USD), ' +
              '"zarUsdChange24h" (number, % change in last 24h, can be negative), ' +
              '"btcZar" (number, Bitcoin price in ZAR), ' +
              '"ethZar" (number, Ethereum price in ZAR), ' +
              '"xrpZar" (number, XRP price in ZAR), ' +
              '"jseAlsi" (number, JSE All Share Index current value), ' +
              '"jseAlsiChange" (number, % change today), ' +
              '"topMovers" (array of 4 objects, each with "name" string, "ticker" string, "price" number in ZAR, "change" number % today). ' +
              'Return ONLY the JSON object.',
          },
          {
            role: 'user',
            content: `Get current live market data for South Africa as of ${today}. Search for: ZAR/USD exchange rate, Bitcoin price in ZAR, Ethereum in ZAR, XRP in ZAR, JSE ALSI index, and 4 JSE top movers today.`,
          },
        ],
      }),
    },
    18_000,
  );

  if (!response.ok) {
    throw new Error(`Perplexity returned ${response.status}`);
  }

  const raw = await response.json();
  const content: string = raw?.choices?.[0]?.message?.content ?? '{}';
  const cleaned = content.replace(/```json|```/g, '').trim();
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!objMatch) throw new Error('No JSON object in Perplexity response');

  const parsed = JSON.parse(objMatch[0]) as Partial<TradingData>;

  // Validate and normalise
  const data: TradingData = {
    zarUsd: typeof parsed.zarUsd === 'number' ? parsed.zarUsd : 18.5,
    zarUsdChange24h: typeof parsed.zarUsdChange24h === 'number' ? parsed.zarUsdChange24h : 0,
    btcZar: typeof parsed.btcZar === 'number' ? parsed.btcZar : 0,
    ethZar: typeof parsed.ethZar === 'number' ? parsed.ethZar : 0,
    xrpZar: typeof parsed.xrpZar === 'number' ? parsed.xrpZar : 0,
    jseAlsi: typeof parsed.jseAlsi === 'number' ? parsed.jseAlsi : 0,
    jseAlsiChange: typeof parsed.jseAlsiChange === 'number' ? parsed.jseAlsiChange : 0,
    topMovers: Array.isArray(parsed.topMovers)
      ? parsed.topMovers.slice(0, 4).map((m) => ({
          name: typeof m.name === 'string' ? m.name : 'Unknown',
          ticker: typeof m.ticker === 'string' ? m.ticker : '???',
          price: typeof m.price === 'number' ? m.price : 0,
          change: typeof m.change === 'number' ? m.change : 0,
        }))
      : [],
    updatedAt: new Date().toISOString(),
    source: 'Perplexity Sonar',
  };

  log({ level: 'info', service: SERVICE, message: 'Trading data fetched', requestId, zarUsd: data.zarUsd });
  return data;
}

export async function GET(req: Request): Promise<Response> {
  const requestId = generateRequestId();

  // Pillar 4: rate limit — 20 req/min per IP to protect Perplexity quota
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const allowed = checkRateLimit(`trading:${ip}`, 20, 60_000);
  departmentRateLimitCounter.add(1, { route: 'trading', outcome: allowed ? 'allowed' : 'blocked' });
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again shortly.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  if (cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json(cache.data, {
      headers: { 'Cache-Control': 'public, max-age=600', 'X-Cache': 'HIT' },
    });
  }

  try {
    const data = await fetchTradingData(requestId);
    cache = { data, cachedAt: Date.now() };
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, max-age=600', 'X-Cache': 'MISS' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({ level: 'error', service: SERVICE, message: 'Trading fetch failed', requestId, error: msg });

    // Return stale cache if available
    if (cache) {
      return NextResponse.json({ ...cache.data, stale: true }, {
        headers: { 'Cache-Control': 'public, max-age=60', 'X-Cache': 'STALE' },
      });
    }

    return NextResponse.json(
      { error: 'FETCH_FAILED', message: 'Unable to fetch market data right now.' },
      { status: 503 },
    );
  }
}
