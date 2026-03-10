import { departmentRateLimitCounter } from '@/lib/observability/pillar4Metrics';
/**
 * News API Route — Category-Aware
 *
 * Fetches live digital economy news for South African creators using
 * the Perplexity Search API. Supports ?category= filtering with
 * per-category independent 10-minute caching and stale fallback.
 *
 * @module api/news
 */

import { NextResponse } from 'next/server';
import { generateRequestId, log, fetchWithTimeout, envTimeoutMs , checkRateLimit } from '@/lib/api-utils';
import dns from 'dns/promises';

const SERVICE = 'news';
const PERPLEXITY_TIMEOUT_MS = envTimeoutMs(process.env.PERPLEXITY_TIMEOUT_MS, 8_000);
const IMAGE_FETCH_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_IMAGE_RESPONSE_BYTES = 2 * 1024 * 1024;

// ─── Category System ──────────────────────────────────────────────────────────

export type NewsCategory = 'Latest' | 'Tech & AI' | 'Finance & Crypto' | 'Startups';

export const VALID_CATEGORIES = new Set<NewsCategory>([
  'Latest',
  'Tech & AI',
  'Finance & Crypto',
  'Startups',
]);

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Two SA-focused Perplexity queries per category.
 * Dual queries are run in parallel and merged for better recall.
 */
export const CATEGORY_QUERIES: Record<NewsCategory, [string, string]> = {
  'Latest': [
    `South Africa digital economy freelancing online income opportunities ${CURRENT_YEAR}`,
    `AI tools digital income South Africa entrepreneurs creators ${CURRENT_YEAR}`,
  ],
  'Tech & AI': [
    `artificial intelligence technology startups South Africa ${CURRENT_YEAR}`,
    `AI tools automation South African developers creators ${CURRENT_YEAR}`,
  ],
  'Finance & Crypto': [
    `cryptocurrency blockchain fintech South Africa ${CURRENT_YEAR}`,
    `digital finance online payments ZAR investing South Africa ${CURRENT_YEAR}`,
  ],
  'Startups': [
    `South Africa tech startups funding venture capital ${CURRENT_YEAR}`,
    `African startup ecosystem entrepreneurship digital business ${CURRENT_YEAR}`,
  ],
};

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

// ─── Per-Category Cache ───────────────────────────────────────────────────────

const newsCache = new Map<NewsCategory, { articles: NewsArticle[]; cachedAt: number }>();

// ─── URL Helpers ──────────────────────────────────────────────────────────────

function sourceFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Unknown';
  }
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
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

async function assertSafeUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Rejected non-HTTP(S) scheme: ${parsed.protocol}`);
  }

  const hostname = stripIpv6Brackets(parsed.hostname);
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(`Blocked private/reserved host: ${hostname}`);
    }
  }

  try {
    // all: true ensures all address families (IPv4 + IPv6) are checked — covers SSRF via IPv6
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    for (const { address } of addresses) {
      for (const pattern of PRIVATE_IP_PATTERNS) {
        if (pattern.test(address)) {
          throw new Error(`Hostname ${hostname} resolves to private IP: ${address}`);
        }
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith('Hostname')) throw err;
    throw new Error(`DNS resolution failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function readHtmlWithinLimit(res: Response): Promise<string | null> {
  const contentLength = res.headers.get('content-length');
  if (contentLength) {
    const declaredLength = parseInt(contentLength, 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_RESPONSE_BYTES) {
      return null;
    }
    return res.text();
  }

  const reader = res.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_IMAGE_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }

    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}

async function resolveSafeImageUrl(value: string, articleUrl: string): Promise<string | null> {
  try {
    const absoluteUrl = new URL(value, articleUrl).toString();
    // re-validat resolved URL — assertSafeUrl checks the absolute form, not just the raw value
    await assertSafeUrl(absoluteUrl);
    return absoluteUrl;
  } catch {
    return null;
  }
}

const GRADIENT_PLACEHOLDER = 'placeholder';

async function fetchOgImage(articleUrl: string, title: string): Promise<string> {
  try {
    await assertSafeUrl(articleUrl);
  } catch {
    return gradientPlaceholder(title);
  }

  try {
    const res = await fetchWithTimeout(
      articleUrl,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ApexNewsBot/1.0; +https://apex-coral-zeta.vercel.app)' },
        redirect: 'manual',  // block redirect-based SSRF
      },
      IMAGE_FETCH_TIMEOUT_MS,
    );

    if (res.status >= 300 && res.status < 400) return gradientPlaceholder(title);
    if (!res.ok) return gradientPlaceholder(title);

    const html = await readHtmlWithinLimit(res);
    if (html === null) return gradientPlaceholder(title);

    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) {
      const abs = await resolveSafeImageUrl(ogMatch[1], articleUrl);
      if (abs) return abs;
    }

    const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (twMatch?.[1]) {
      const abs = await resolveSafeImageUrl(twMatch[1], articleUrl);
      if (abs) return abs;
    }

    return gradientPlaceholder(title);
  } catch {
    return gradientPlaceholder(title);
  }
}

void GRADIENT_PLACEHOLDER; // suppress unused warning

function gradientPlaceholder(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 55) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:hsl(${h1},55%,12%)"/><stop offset="100%" style="stop-color:hsl(${h2},45%,7%)"/></linearGradient></defs><rect width="800" height="420" fill="url(#g)"/><text x="400" y="210" font-family="system-ui,sans-serif" font-size="16" fill="rgba(255,255,255,0.25)" text-anchor="middle" dominant-baseline="middle">${title.slice(0, 60).replace(/[<>&"]/g, '')}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchArticlesForCategory(
  category: NewsCategory,
  apiKey: string,
  requestId: string,
): Promise<NewsArticle[]> {
  const [queryA, queryB] = CATEGORY_QUERIES[category];

  const makeBody = (query: string) => ({
    query,
    max_results: 5,
    max_tokens_per_page: 256,
    max_tokens: 2000,
    country: 'ZA',
    search_language_filter: ['en'],
    search_domain_filter: ['-pinterest.com', '-reddit.com', '-quora.com'],
  });

  const fetchOptions = (query: string) =>
    fetchWithTimeout(
      'https://api.perplexity.ai/search',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(makeBody(query)),
      },
      PERPLEXITY_TIMEOUT_MS,
    );

  // Fire both queries in parallel for better recall
  const [resA, resB] = await Promise.all([fetchOptions(queryA), fetchOptions(queryB)]);

  const parseResults = (res: Response, data: unknown): PerplexityResult[] => {
    if (!res.ok) return [];
    const d = data as { results?: PerplexityResult[][] | PerplexityResult[] };
    if (!Array.isArray(d?.results)) return [];
    if (d.results.length > 0 && Array.isArray(d.results[0])) {
      return (d.results as PerplexityResult[][]).flat();
    }
    return d.results as PerplexityResult[];
  };

  let dataA: unknown = {};
  let dataB: unknown = {};
  try { dataA = await resA.json(); } catch { /* ignore */ }
  try { dataB = await resB.json(); } catch { /* ignore */ }

  const combined = [...parseResults(resA, dataA), ...parseResults(resB, dataB)];

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = combined.filter(r => {
    if (!r?.url || seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  }).slice(0, 8);

  log({ level: 'info', service: SERVICE, message: `Category "${category}" — ${unique.length} unique articles`, requestId });

  return Promise.all(
    unique.map(async (r): Promise<NewsArticle> => ({
      title: r.title ?? 'Untitled',
      url: r.url,
      snippet: (r.snippet ?? '').replace(/#+\s/g, '').slice(0, 220).trim(),
      date: r.date ?? r.last_updated ?? null,
      source: sourceFromUrl(r.url),
      imageUrl: await fetchOgImage(r.url, r.title ?? ''),
    })),
  );
}

// ─── GET Handler ──────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  const requestId = generateRequestId();

  // Pillar 4: rate limit — 30 req/min per IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const newsAllowed = checkRateLimit(`news:${ip}`, 30, 60_000);
  departmentRateLimitCounter.add(1, { route: 'news', outcome: newsAllowed ? 'allowed' : 'blocked' });
  if (!newsAllowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again shortly.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  // Parse ?category= param — validate against whitelist, fall back to 'Latest'
  const { searchParams } = new URL(req.url);
  const rawCategory = searchParams.get('category') ?? 'Latest';
  const category: NewsCategory = VALID_CATEGORIES.has(rawCategory as NewsCategory)
    ? (rawCategory as NewsCategory)
    : 'Latest';

  // Per-category cache check
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
  log({ level: 'info', service: SERVICE, message: `Fetching news — category: "${category}"`, requestId });

  try {
    const articles = await fetchArticlesForCategory(category, apiKey, requestId);

    newsCache.set(category, { articles, cachedAt: Date.now() });

    log({
      level: 'info',
      service: SERVICE,
      message: `News ready — ${articles.length} articles`,
      requestId,
      category,
      durationMs: Date.now() - startMs,
    });

    return NextResponse.json(
      { articles, cached: false, category, requestId },
      { headers: { 'X-Request-Id': requestId } },
    );
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    log({
      level: 'error',
      service: SERVICE,
      message: isTimeout ? 'Perplexity timed out' : 'News fetch failed',
      requestId,
      category,
      durationMs: Date.now() - startMs,
    });

    // Stale-on-error: return cached data even if expired
    const stale = newsCache.get(category);
    if (stale) {
      return NextResponse.json({ articles: stale.articles, cached: true, stale: true, category, requestId });
    }

    return NextResponse.json(
      { error: isTimeout ? 'TIMEOUT' : 'INTERNAL_ERROR', message: 'Failed to fetch news.', requestId },
      { status: isTimeout ? 504 : 500, headers: { 'X-Request-Id': requestId } },
    );
  }
}

export const dynamic = 'force-dynamic';
