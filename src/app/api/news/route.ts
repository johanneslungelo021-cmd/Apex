/**
 * News API Route — Phase 2 · Category-Aware
 *
 * Fetches live digital economy news for South African creators using the
 * Perplexity Search API. Supports four categories via a ?category= query
 * parameter, each with its own independent 10-minute cache and two
 * complementary SA-focused search queries.
 *
 * SSRF protections:
 *   - assertSafeUrl: DNS + private-IP block with full IPv4+IPv6 coverage
 *   - dns.lookup({ all: true }) — covers all address families
 *   - resolveSafeImageUrl: resolves relative OG paths, re-validates resolved URL
 *   - redirect: 'manual' — blocks redirect-based SSRF
 *   - 2 MB response cap on image metadata fetches
 *
 * @module app/api/news
 */

import { NextResponse } from 'next/server';
import { generateRequestId, log, fetchWithTimeout, envTimeoutMs } from '@/lib/api-utils';
import dns from 'dns/promises';

const SERVICE = 'news';
const PERPLEXITY_TIMEOUT_MS = envTimeoutMs(process.env.PERPLEXITY_TIMEOUT_MS, 14_000);
const IMAGE_FETCH_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_IMAGE_RESPONSE_BYTES = 2 * 1024 * 1024;

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Category routing ─────────────────────────────────────────────────────────

/** Whitelist of accepted category values. */
export const VALID_CATEGORIES = new Set(['Latest', 'Tech & AI', 'Finance & Crypto', 'Startups']);

/**
 * Two complementary SA-focused queries per category — run in parallel
 * so both signals feed the merged article list.
 */
const CATEGORY_QUERIES: Record<string, [string, string]> = {
  'Latest':            ['South Africa digital economy news 2026',                    'South Africa tech startups news March 2026'],
  'Tech & AI':         ['South Africa artificial intelligence technology news 2026',  'SA AI machine learning fintech latest 2026'],
  'Finance & Crypto':  ['South Africa cryptocurrency blockchain finance news 2026',   'SA rand digital payments crypto March 2026'],
  'Startups':          ['South Africa startup funding investment news 2026',          'Cape Town Johannesburg startup ecosystem 2026'],
};

// ─── Per-category in-memory cache ─────────────────────────────────────────────

const newsCache = new Map<string, { articles: NewsArticle[]; cachedAt: number }>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sourceFromUrl(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return 'Unknown'; }
}

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^255\./,
  /^100\.(6[4-9]|[7-9]\d|10[0-3])\./,
  /^198\.(1[89]|19)\./,
  /^192\.0\.2\./,
  /^198\.51\.100\./,
  /^203\.0\.113\./,
  /^(22[4-9]|23\d)\./,
  /^(24\d|25[0-5])\./,
  /^::1$/,
  /^[Ff][CcDd]/,
  /^[Ff][Ee][89aAbB]/,
  /^2001:[Dd][Bb]8:/,
  /^[Ff][Ff]/,
  /^::[Ff][Ff][Ff][Ff]:(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|255\.)/,
];

function stripIpv6Brackets(hostname: string): string {
  return (hostname.startsWith('[') && hostname.endsWith(']'))
    ? hostname.slice(1, -1) : hostname;
}

async function assertSafeUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try { parsed = new URL(rawUrl); }
  catch { throw new Error(`Invalid URL: ${rawUrl}`); }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Disallowed protocol: ${parsed.protocol}`);
  }

  const hostname = stripIpv6Brackets(parsed.hostname);

  // Reject bare IP literals before DNS
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || /^[0-9a-fA-F:]+$/.test(hostname)) {
    if (PRIVATE_IP_PATTERNS.some((re) => re.test(hostname))) {
      throw new Error(`SSRF: private IP literal ${hostname}`);
    }
    return;
  }

  // DNS resolution — { all: true } covers all address families including IPv6
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  for (const { address } of addresses as { address: string }[]) {
    if (PRIVATE_IP_PATTERNS.some((re) => re.test(address))) {
      throw new Error(`SSRF: ${hostname} resolved to private IP ${address}`);
    }
  }
}

/**
 * Resolves a potentially relative OG/Twitter image URL to absolute form
 * and re-validates the resolved URL against SSRF rules.
 */
async function resolveSafeImageUrl(value: string, articleUrl: string): Promise<string | null> {
  try {
    const absoluteUrl = new URL(value, articleUrl).href;
    await assertSafeUrl(absoluteUrl); // re-validat resolved URL
    return absoluteUrl;
  } catch {
    return null;
  }
}

const GRADIENT_PLACEHOLDER =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiMxZTFiNGIiLz48c3RvcCBvZmZzZXQ9IjUwJSIgc3RvcC1jb2xvcj0iIzBmMTcyYSIvPjxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzBjMWExMCIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjxyZWN0IHdpZHRoPSI4MDAiIGhlaWdodD0iNDUwIiBmaWxsPSJ1cmwoI2cpIi8+PC9zdmc+';

async function fetchOgImage(articleUrl: string): Promise<string> {
  try {
    await assertSafeUrl(articleUrl);

    const res = await fetchWithTimeout(
      articleUrl,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 Apexbot/1.0 (+https://apex-sentient.vercel.app)' },
        redirect: 'manual', // block redirect-based SSRF — 3xx responses are rejected below
      },
      IMAGE_FETCH_TIMEOUT_MS,
    );

    // Reject any 3xx redirect — prevents redirect to private IPs
    if (res.status >= 300 && res.status < 400) return GRADIENT_PLACEHOLDER;
    if (!res.ok) return GRADIENT_PLACEHOLDER;

    const reader = res.body?.getReader();
    if (!reader) return GRADIENT_PLACEHOLDER;

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_IMAGE_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        return GRADIENT_PLACEHOLDER;
      }
      chunks.push(value);
    }

    const html = new TextDecoder().decode(
      chunks.reduce((acc, c) => {
        const m = new Uint8Array(acc.byteLength + c.byteLength);
        m.set(acc, 0); m.set(c, acc.byteLength); return m;
      }, new Uint8Array(0)),
    );

    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) {
      const abs = await resolveSafeImageUrl(ogMatch[1], articleUrl);
      if (abs) return abs;
    }

    const twMatch =
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (twMatch?.[1]) {
      const abs = await resolveSafeImageUrl(twMatch[1], articleUrl);
      if (abs) return abs;
    }

    return GRADIENT_PLACEHOLDER;
  } catch {
    return GRADIENT_PLACEHOLDER;
  }
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const url = new URL(req.url);

  // Validate and normalise category — unknown values fall back to 'Latest'
  const rawCategory = decodeURIComponent(url.searchParams.get('category') ?? 'Latest');
  const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'Latest';
  const [query1, query2] = CATEGORY_QUERIES[category];

  // Serve from per-category in-memory cache when still fresh
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
  log({ level: 'info', service: SERVICE, message: `Fetching news — category: ${category}`, requestId });

  try {
    // Fire both queries in parallel for better recall
    const fetchQuery = async (query: string): Promise<PerplexityResult[]> => {
      const res = await fetchWithTimeout(
        'https://api.perplexity.ai/search',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, search_recency_filter: 'week', return_related_questions: false }),
        },
        PERPLEXITY_TIMEOUT_MS,
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results ?? data.web_search_results ?? []) as PerplexityResult[];
    };

    const [results1, results2] = await Promise.all([fetchQuery(query1), fetchQuery(query2)]);

    // Merge and deduplicate by URL
    const seen = new Set<string>();
    const merged: PerplexityResult[] = [];
    for (const r of [...results1, ...results2]) {
      if (!seen.has(r.url)) { seen.add(r.url); merged.push(r); }
    }

    // Enrich with OG images (up to 12 articles, all in parallel)
    const articles: NewsArticle[] = await Promise.all(
      merged.slice(0, 12).map(async (r) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        date: r.date ?? r.last_updated ?? null,
        source: sourceFromUrl(r.url),
        imageUrl: await fetchOgImage(r.url),
      })),
    );

    newsCache.set(category, { articles, cachedAt: Date.now() });

    log({
      level: 'info', service: SERVICE,
      message: `News ready — ${articles.length} articles for "${category}"`,
      requestId, durationMs: Date.now() - startMs,
    });

    return NextResponse.json(
      { articles, cached: false, category, requestId },
      { headers: { 'X-Request-Id': requestId } },
    );
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    log({ level: 'error', service: SERVICE, message: 'News fetch failed', requestId, error: errMsg });

    // Stale-on-error: return cached data even if expired
    const stale = newsCache.get(category);
    if (stale) {
      return NextResponse.json({ articles: stale.articles, cached: true, stale: true, category, requestId });
    }

    return NextResponse.json(
      { error: 'FETCH_FAILED', message: 'News temporarily unavailable.', requestId },
      { status: 503, headers: { 'X-Request-Id': requestId } },
    );
  }
}

export const dynamic = 'force-dynamic';
