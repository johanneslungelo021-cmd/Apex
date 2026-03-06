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
 * Covers: loopback, RFC-1918 private, link-local, unique-local, and IPv6 loopback.
 */
const PRIVATE_IP_PATTERNS = [
  // IPv4 loopback
  /^127\./,
  // IPv4 private class A
  /^10\./,
  // IPv4 private class B (172.16.0.0–172.31.255.255)
  /^172\.(1[6-9]|2\d|3[01])\./,
  // IPv4 private class C
  /^192\.168\./,
  // IPv4 link-local
  /^169\.254\./,
  // IPv4 "this network" and broadcast
  /^0\./,
  /^255\./,
  // IPv6 loopback (::1) and unique-local (fc00::/7, so fc and fd prefixes)
  /^::1$/,
  /^[Ff][CcDd]/,
  // IPv6 link-local (fe80::/10)
  /^[Ff][Ee][89aAbB]/,
];

/**
 * Validates that a URL is safe to fetch (SSRF prevention).
 *
 * Checks:
 * 1. URL parses as http: or https: — no other schemes
 * 2. Hostname resolves and the resolved IP is not in a private/reserved range
 *
 * @param rawUrl - The URL string to validate
 * @throws Error with a descriptive message if the URL fails any check
 */
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

  // Reject bare IP literals that are private without DNS lookup
  const hostname = parsed.hostname;
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(`Blocked private/reserved host: ${hostname}`);
    }
  }

  // Resolve hostname → IPs and verify none are private
  try {
    const addresses = await dns.resolve(hostname);
    for (const addr of addresses) {
      for (const pattern of PRIVATE_IP_PATTERNS) {
        if (pattern.test(addr)) {
          throw new Error(`Hostname ${hostname} resolves to private IP: ${addr}`);
        }
      }
    }
  } catch (err: unknown) {
    // If it was our own validation error, re-throw
    if (err instanceof Error && err.message.startsWith('Hostname')) throw err;
    // DNS resolution failure for unknown host — also reject
    throw new Error(`DNS resolution failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Fetches the og:image or twitter:image from an article URL.
 *
 * SSRF protection: validates the URL scheme and resolves the hostname
 * to confirm it does not point to a private/reserved IP before fetching.
 *
 * Relative image URLs are resolved to absolute using the article URL as base.
 * Falls back to a deterministic SVG gradient placeholder on any failure.
 *
 * @param articleUrl - The article URL to fetch the image from (must be http/https + public host)
 * @param title - The article title (used for placeholder generation)
 * @returns An absolute image URL or a base64 SVG gradient data URI
 */
async function fetchOgImage(articleUrl: string, title: string): Promise<string> {
  // SSRF guard — throws early for private/invalid URLs so fetchWithTimeout is never called
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
        // Disable automatic redirect following. A public domain could validate cleanly
        // via assertSafeUrl and then redirect to an internal address (e.g. 169.254.x.x,
        // localhost), bypassing all SSRF protections. With 'manual', the fetch returns
        // the 3xx response directly without following the Location header.
        redirect: 'manual',
      },
      IMAGE_FETCH_TIMEOUT_MS,
    );

    // Reject any redirect response outright — never follow or validate Location.
    // The Location header may point to a private/internal address and must not be trusted.
    if (res.status >= 300 && res.status < 400) return gradientPlaceholder(title);
    if (!res.ok) return gradientPlaceholder(title);
    const html = await res.text();

    /**
     * Resolves a potentially relative image URL to absolute using the article URL as base.
     * Returns null if resolution fails (e.g. truly malformed value).
     */
    const toAbsolute = (value: string): string | null => {
      try {
        return new URL(value, articleUrl).toString();
      } catch {
        return null;
      }
    };

    // og:image — standard property (two attribute orders)
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) {
      const abs = toAbsolute(ogMatch[1]);
      if (abs) return abs;
    }

    // twitter:image fallback
    const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (twMatch?.[1]) {
      const abs = toAbsolute(twMatch[1]);
      if (abs) return abs;
    }

    return gradientPlaceholder(title);
  } catch {
    return gradientPlaceholder(title);
  }
}

/**
 * Generates a deterministic per-title gradient SVG placeholder.
 * The gradient colors are derived from the title hash for consistency.
 *
 * @param title - The article title
 * @returns A base64-encoded SVG data URL
 */
function gradientPlaceholder(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = title.charCodeAt(i) + ((hash << 5) - hash);
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 55) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:hsl(${h1},55%,12%)"/><stop offset="100%" style="stop-color:hsl(${h2},45%,7%)"/></linearGradient></defs><rect width="800" height="420" fill="url(#g)"/><text x="400" y="210" font-family="system-ui,sans-serif" font-size="16" fill="rgba(255,255,255,0.25)" text-anchor="middle" dominant-baseline="middle">${title.slice(0, 60).replace(/[<>&"]/g, '')}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * Handles GET requests for live news articles.
 *
 * Fetches digital economy news relevant to South African creators from
 * Perplexity Search API. Results are cached for 10 minutes with stale
 * fallback on errors.
 *
 * @returns JSON response with articles array or error
 *
 * @example
 * // GET /api/news
 * // Response: { articles: [...], cached: false, requestId: "abc123" }
 */
export async function GET(): Promise<Response> {
  const requestId = generateRequestId();

  // Serve cache if still fresh
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
    // Dynamic year so results always reference the current year — never stale
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
      const errText = await response.text().catch(() => '');
      log({ level: 'warn', service: SERVICE, message: `Perplexity HTTP ${response.status}`, requestId, error: errText });
      if (newsCache) return NextResponse.json({ articles: newsCache.articles, cached: true, stale: true, requestId });
      return NextResponse.json(
        { error: 'UPSTREAM_ERROR', message: 'News service temporarily unavailable.', requestId },
        { status: 502, headers: { 'X-Request-Id': requestId } },
      );
    }

    const data = await response.json() as { results: PerplexityResult[][] | PerplexityResult[] };

    // Multi-query: results is array-of-arrays; single query: flat array
    let flat: PerplexityResult[] = [];
    if (Array.isArray(data.results)) {
      if (data.results.length > 0 && Array.isArray(data.results[0])) {
        flat = (data.results as PerplexityResult[][]).flat();
      } else {
        flat = data.results as PerplexityResult[];
      }
    }

    // Deduplicate by URL, keep up to 8
    const seen = new Set<string>();
    const unique = flat.filter(r => {
      if (!r?.url || seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    }).slice(0, 8);

    // Fetch OG images in parallel — best-effort, failures return gradient placeholders
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
