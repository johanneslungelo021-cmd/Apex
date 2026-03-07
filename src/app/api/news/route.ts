/**
 * News API Route
 *
 * Fetches live digital economy news for South African creators using
 * the Perplexity Search API. Supports category filtering via ?category= query
 * parameter. Implements per-category 10-minute caching with stale fallback.
 *
 * Supported categories:
 *   Latest          — General SA digital economy & income opportunities
 *   Tech & AI       — AI, software development, tech innovation in SA
 *   Finance & Crypto — Fintech, cryptocurrency, digital finance in SA
 *   Startups        — Startup funding, venture capital, SA entrepreneurship
 *
 * @module api/news
 */

import { NextResponse } from 'next/server';
import { generateRequestId, log, fetchWithTimeout, envTimeoutMs } from '@/lib/api-utils';
import dns, { type LookupAddress } from 'dns/promises';

const SERVICE = 'news';
const PERPLEXITY_TIMEOUT_MS = envTimeoutMs(process.env.PERPLEXITY_TIMEOUT_MS, 14_000);
const IMAGE_FETCH_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_IMAGE_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface NewsArticle {
  title: string;
  url: string;
  snippet: string;
  date: string | null;
  source: string;
  imageUrl: string;
}

interface PerplexityResult {
  title: string;
  url: string;
  snippet: string;
  date?: string;
  last_updated?: string;
}

const VALID_CATEGORIES = new Set(['Latest', 'Tech & AI', 'Finance & Crypto', 'Startups']);

const CATEGORY_QUERIES: Record<string, [string, string]> = {
  'Latest': [
    `South Africa digital economy freelancing online income opportunities ${new Date().getFullYear()}`,
    `AI tools digital income South Africa entrepreneurs creators ${new Date().getFullYear()}`,
  ],
  'Tech & AI': [
    `artificial intelligence machine learning tech innovation South Africa ${new Date().getFullYear()}`,
    `software development SA tech startups digital transformation ${new Date().getFullYear()}`,
  ],
  'Finance & Crypto': [
    `cryptocurrency fintech digital finance South Africa ${new Date().getFullYear()}`,
    `blockchain digital banking investment SA rand ${new Date().getFullYear()}`,
  ],
  'Startups': [
    `startup funding venture capital entrepreneurship South Africa ${new Date().getFullYear()}`,
    `SA tech founders small business digital innovation ${new Date().getFullYear()}`,
  ],
};

/** Per-category in-memory cache. Keyed by category name. */
const newsCache = new Map<string, { articles: NewsArticle[]; cachedAt: number }>();

function sourceFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Unknown';
  }
}

const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^169\.254\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^198\.1[89]\./,
  /^192\.0\.2\./, /^198\.51\.100\./, /^203\.0\.113\./, /^0\./, /^255\./,
  /^(22[4-9]|23\d)\./, /^(24\d|25[0-5])\./, /^::1$/, /^[Ff][CcDd]/,
  /^[Ff][Ee][89aAbB]/, /^::$/, /^2001:db8:/i, /^[Ff][Ff][0-9a-fA-F]{2}:/,
  /^::ffff:(?:127|10)\./i, /^::ffff:172\.(1[6-9]|2\d|3[01])\./i,
  /^::ffff:192\.168\./i, /^::ffff:169\.254\./i,
];

async function assertSafeUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch { throw new Error(`Invalid URL: ${rawUrl}`); }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Rejected non-HTTP(S) scheme: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  for (const p of PRIVATE_IP_PATTERNS) {
    if (p.test(hostname)) throw new Error(`Blocked private/reserved host: ${hostname}`);
  }

  const addresses: LookupAddress[] = await dns.lookup(hostname, { all: true, verbatim: true }).catch((err) => {
    throw new Error(`DNS resolution failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`);
  });

  if (addresses.length === 0) throw new Error(`No DNS records found for ${hostname}`);

  for (const { address } of addresses) {
    for (const p of PRIVATE_IP_PATTERNS) {
      if (p.test(address)) throw new Error(`Hostname ${hostname} resolves to private IP: ${address}`);
    }
  }
}

async function readHtmlWithinLimit(res: Response): Promise<string | null> {
  const cl = res.headers.get('content-length');
  if (cl) {
    const n = parseInt(cl, 10);
    if (Number.isFinite(n) && n > MAX_IMAGE_RESPONSE_BYTES) return null;
    return res.text();
  }
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_IMAGE_RESPONSE_BYTES) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.byteLength; }
  return new TextDecoder().decode(merged);
}

async function fetchOgImage(articleUrl: string, title: string): Promise<string> {
  try { await assertSafeUrl(articleUrl); } catch { return gradientPlaceholder(title); }
  try {
    const res = await fetchWithTimeout(
      articleUrl,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ApexNewsBot/1.0)' }, redirect: 'manual' },
      IMAGE_FETCH_TIMEOUT_MS,
    );
    if (res.status >= 300 && res.status < 400) return gradientPlaceholder(title);
    if (!res.ok) return gradientPlaceholder(title);
    const html = await readHtmlWithinLimit(res);
    if (!html) return gradientPlaceholder(title);
    const toAbs = (v: string) => { try { return new URL(v, articleUrl).toString(); } catch { return null; } };
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (og?.[1]) { const a = toAbs(og[1]); if (a) return a; }
    const tw = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (tw?.[1]) { const a = toAbs(tw[1]); if (a) return a; }
    return gradientPlaceholder(title);
  } catch { return gradientPlaceholder(title); }
}

function gradientPlaceholder(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 55) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:hsl(${h1},55%,12%)"/><stop offset="100%" style="stop-color:hsl(${h2},45%,7%)"/></linearGradient></defs><rect width="800" height="420" fill="url(#g)"/><text x="400" y="210" font-family="system-ui,sans-serif" font-size="16" fill="rgba(255,255,255,0.25)" text-anchor="middle" dominant-baseline="middle">${title.slice(0, 60).replace(/[<>&"]/g, '')}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export async function GET(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get('category') ?? 'Latest';
  const category = VALID_CATEGORIES.has(raw) ? raw : 'Latest';
  const queries = CATEGORY_QUERIES[category];

  const cached = newsCache.get(category);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ articles: cached.articles, cached: true, category, requestId });
  }

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    log({ level: 'error', service: SERVICE, message: 'PERPLEXITY_API_KEY not set', requestId });
    return NextResponse.json(
      { error: 'SERVICE_UNAVAILABLE', message: 'News service not configured.', requestId },
      { status: 503, headers: { 'X-Request-Id': requestId } },
    );
  }

  const startMs = Date.now();
  log({ level: 'info', service: SERVICE, message: `Fetching news for category: ${category}`, requestId });

  try {
    const response = await fetchWithTimeout(
      'https://api.perplexity.ai/search',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queries,
          max_results: 5,
          max_tokens_per_page: 512,
          max_tokens: 8000,
          country: 'ZA',
          search_language_filter: ['en'],
          search_domain_filter: ['-pinterest.com', '-reddit.com', '-quora.com'],
        }),
      },
      PERPLEXITY_TIMEOUT_MS,
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      log({ level: 'warn', service: SERVICE, message: `Perplexity HTTP ${response.status} for ${category}`, requestId, error: errText });
      if (cached) return NextResponse.json({ articles: cached.articles, cached: true, stale: true, category, requestId });
      return NextResponse.json(
        { error: 'UPSTREAM_ERROR', message: 'News service temporarily unavailable.', requestId },
        { status: 502, headers: { 'X-Request-Id': requestId } },
      );
    }

    const data = await response.json() as { results: PerplexityResult[][] | PerplexityResult[] };
    let flat: PerplexityResult[] = [];
    if (Array.isArray(data.results)) {
      flat = data.results.length > 0 && Array.isArray(data.results[0])
        ? (data.results as PerplexityResult[][]).flat()
        : data.results as PerplexityResult[];
    }

    const seen = new Set<string>();
    const unique = flat.filter(r => {
      if (!r?.url || seen.has(r.url)) return false;
      seen.add(r.url); return true;
    }).slice(0, 8);

    const articles: NewsArticle[] = await Promise.all(
      unique.map(async (r): Promise<NewsArticle> => ({
        title: r.title ?? 'Untitled',
        url: r.url,
        snippet: (r.snippet ?? '').replace(/#+\s/g, '').slice(0, 220).trim(),
        date: r.date ?? r.last_updated ?? null,
        source: sourceFromUrl(r.url),
        imageUrl: await fetchOgImage(r.url, r.title ?? ''),
      })),
    );

    newsCache.set(category, { articles, cachedAt: Date.now() });
    log({ level: 'info', service: SERVICE, message: `News ready — ${articles.length} articles for ${category}`, requestId, durationMs: Date.now() - startMs });
    return NextResponse.json({ articles, cached: false, category, requestId }, { headers: { 'X-Request-Id': requestId } });

  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    log({ level: 'error', service: SERVICE, message: isTimeout ? `Timeout for ${category}` : `News fetch failed for ${category}`, requestId, error: String(err), durationMs: Date.now() - startMs });
    if (cached) return NextResponse.json({ articles: cached.articles, cached: true, stale: true, category, requestId });
    return NextResponse.json(
      { error: isTimeout ? 'TIMEOUT' : 'INTERNAL_ERROR', message: 'Failed to fetch news.', requestId },
      { status: isTimeout ? 504 : 500, headers: { 'X-Request-Id': requestId } },
    );
  }
}

export const dynamic = 'force-dynamic';
