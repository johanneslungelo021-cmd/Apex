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
 * Fetches the og:image from an article URL.
 * Returns a deterministic SVG gradient placeholder on any failure.
 *
 * @param articleUrl - The article URL to fetch the image from
 * @param title - The article title (used for placeholder generation)
 * @returns The image URL or gradient placeholder
 */
async function fetchOgImage(articleUrl: string, title: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      articleUrl,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ApexNewsBot/1.0; +https://apex-coral-zeta.vercel.app)' } },
      IMAGE_FETCH_TIMEOUT_MS,
    );
    if (!res.ok) return gradientPlaceholder(title);
    const html = await res.text();

    // og:image — standard
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) return ogMatch[1];

    // twitter:image fallback
    const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    if (twMatch?.[1]) return twMatch[1];

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
    // Multi-query: per the Perplexity docs, query array returns results grouped per query
    const body = {
      query: [
        'South Africa digital economy freelancing online income opportunities 2025',
        'AI tools digital income South Africa entrepreneurs creators 2025',
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
