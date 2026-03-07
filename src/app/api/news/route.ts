/**
 * News API Route
 *
 * Fetches live digital economy news for South African creators using
 * the Perplexity Search API. Implements 10-minute caching with stale
 * fallback for reliability.
 *
 * @module api/news
 *
 * @see https://docs.perplexity.ai/api-reference/search
 */

import { NextResponse } from 'next/server';
import { generateRequestId, log, fetchWithTimeout, envTimeoutMs } from '@/lib/api-utils';
import dns from 'dns/promises';

const SERVICE = 'news';
const PERPLEXITY_TIMEOUT_MS = envTimeoutMs(process.env.PERPLEXITY_TIMEOUT_MS, 14_000);
const IMAGE_FETCH_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_IMAGE_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB cap for OG images

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A news article with metadata and image.
 */
export interface NewsArticle {
  /** Article headline */
  title: string;
  /** Article URL */
  url: string;
  /** Article snippet/summary */
  snippet: string;
  /** Publication date (ISO string or null) */
  date: string | null;
  /** Source domain name */
  source: string;
  /** Article image URL or gradient placeholder */
  imageUrl: string;
}

/**
 * Raw result from Perplexity Search API.
 */
interface PerplexityResult {
  title: string;
  url: string;
  snippet: string;
  date?: string;
  last_updated?: string;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

/** Cached news articles with timestamp */
let newsCache: { articles: NewsArticle[]; cachedAt: number } | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts the source domain from a URL.
 *
 * @param url - The article URL
 * @returns The hostname without www prefix, or 'Unknown' on parse failure
 */
function sourceFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Unknown';
  }
}

/**
 * Private/reserved IP ranges that must never be fetched (SSRF protection).
 * Covers: loopback, RFC-1918 private, link-local, unique-local, CGNAT,
 * benchmark, documentation, multicast, reserved, and IPv6 equivalents.
 */
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

/**
 * Reads a response body as text while enforcing the MAX_IMAGE_RESPONSE_BYTES cap.
 * Uses the existing content-length fast path when available. Otherwise it streams
 * the response body and stops once the accumulated bytes would exceed the limit.
 */
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
        redirect: 'manual',
      },
      IMAGE_FETCH_TIMEOUT_MS,
    );

    if (res.status >= 300 && res.status < 400) return gradientPlaceholder(title);
    if (!res.ok) return gradientPlaceholder(title);

    const html = await readHtmlWithinLimit(res);
    if (html === null) return gradientPlaceholder(title);

    /**
     * Resolves a potentially relative image URL to absolute AND re-validates with SSRF checks.
     * This prevents bypass where a public page includes an OG:image pointing to a private IP.
     * Returns null if resolution fails OR the resolved URL fails SSRF validation.
     */
    const resolveSafeImageUrl = async (value: string): Promise<string | null> => {
      try {
        const absolute = new URL(value, articleUrl).toString();
        // Re-validate the resolved URL — it may now point to a private IP
        await assertSafeUrl(absolute);
        return absolute;
      } catch {
        return null;
      }
    };

    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) {
      const abs = await resolveSafeImageUrl(ogMatch[1]);
      if (abs) return abs;
    }

    const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (twMatch?.[1]) {
      const abs = await resolveSafeImageUrl(twMatch[1]);
      if (abs) return abs;
    }

    return gradientPlaceholder(title);
  } catch {
    return gradientPlaceholder(title);
  }
}

function gradientPlaceholder(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 55) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:hsl(${h1},55%,12%)"/><stop offset="100%" style="stop-color:hsl(${h2},45%,7%)"/></linearGradient></defs><rect width="800" height="420" fill="url(#g)"/><text x="400" y="210" font-family="system-ui,sans-serif" font-size="16" fill="rgba(255,255,255,0.25)" text-anchor="middle" dominant-baseline="middle">${title.slice(0, 60).replace(/[<>&"]/g, '')}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export async function GET(): Promise<Response> {
  const requestId = generateRequestId();

  if (newsCache && Date.now() - newsCache.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ articles: newsCache.articles, cached: true, requestId });
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
  log({ level: 'info', service: SERVICE, message: 'Fetching live news', requestId });

  try {
    const currentYear = new Date().getFullYear();
    const body = {
      query: [
        `South Africa digital economy freelancing online income opportunities ${currentYear}`,
        `AI tools digital income South Africa entrepreneurs creators ${currentYear}`,
      ],
      max_results: 5,
      max_tokens_per_page: 512,
      max_tokens: 8000,
      country: 'ZA',
      search_language_filter: ['en'],
      search_domain_filter: ['-pinterest.com', '-reddit.com', '-quora.com'],
    };

    const response = await fetchWithTimeout(
      'https://api.perplexity.ai/search',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      PERPLEXITY_TIMEOUT_MS,
    );

    if (!response.ok) {
      // Consume the response body to allow connection reuse, but do NOT log raw error text.
      // The body may contain sensitive user data echoed back from Perplexity.
      await response.text().catch(() => {});
      log({ level: 'warn', service: SERVICE, message: `Perplexity HTTP ${response.status}`, requestId });
      if (newsCache) return NextResponse.json({ articles: newsCache.articles, cached: true, stale: true, requestId });
      return NextResponse.json(
        { error: 'UPSTREAM_ERROR', message: 'News service temporarily unavailable.', requestId },
        { status: 502, headers: { 'X-Request-Id': requestId } },
      );
    }

    const data = await response.json() as { results: PerplexityResult[][] | PerplexityResult[] };

    let flat: PerplexityResult[] = [];
    if (Array.isArray(data.results)) {
      if (data.results.length > 0 && Array.isArray(data.results[0])) {
        flat = (data.results as PerplexityResult[][]).flat();
      } else {
        flat = data.results as PerplexityResult[];
      }
    }

    const seen = new Set<string>();
    const unique = flat.filter(r => {
      if (!r?.url || seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
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

    newsCache = { articles, cachedAt: Date.now() };

    log({ level: 'info', service: SERVICE, message: `News ready — ${articles.length} articles`, requestId, durationMs: Date.now() - startMs });

    return NextResponse.json({ articles, cached: false, requestId }, { headers: { 'X-Request-Id': requestId } });
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    log({ level: 'error', service: SERVICE, message: isTimeout ? 'Perplexity timed out' : 'News fetch failed', requestId, error: String(err), durationMs: Date.now() - startMs });
    if (newsCache) return NextResponse.json({ articles: newsCache.articles, cached: true, stale: true, requestId });
    return NextResponse.json(
      { error: isTimeout ? 'TIMEOUT' : 'INTERNAL_ERROR', message: 'Failed to fetch news.', requestId },
      { status: isTimeout ? 504 : 500, headers: { 'X-Request-Id': requestId } },
    );
  }
}

export const dynamic = 'force-dynamic';
