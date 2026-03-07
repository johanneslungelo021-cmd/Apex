/**
 * Notion News Ingest Endpoint
 *
 * Accepts authenticated POST requests from a Notion automation (via Make,
 * Zapier, n8n, or a custom script) carrying curated news articles per category.
 * Articles are stored in the shared Notion cache and served with priority over
 * Perplexity Search results by the /api/news route.
 *
 * Authentication: Bearer token in Authorization header matching NOTION_INGEST_SECRET.
 *
 * Request shape:
 *   POST /api/notion/ingest
 *   Authorization: Bearer <NOTION_INGEST_SECRET>
 *   Content-Type: application/json
 *   {
 *     "category": "Tech & AI",
 *     "articles": [
 *       {
 *         "title": "SA AI startup raises R50m Series A",
 *         "url": "https://techcentral.co.za/...",
 *         "snippet": "Cape Town-based...",
 *         "date": "2026-03-07T10:00:00Z",
 *         "source": "techcentral.co.za",
 *         "imageUrl": "https://..."
 *       }
 *     ]
 *   }
 *
 * Response shape (success):
 *   { "success": true, "category": "Tech & AI", "count": 4, "requestId": "..." }
 *
 * @module api/notion/ingest
 */

import { NextResponse } from 'next/server';
import { generateRequestId, log } from '@/lib/api-utils';
import { setNotionArticles } from '@/lib/notion-cache';
import { notionIngestCounter } from '@/lib/metrics';
import type { NewsArticle } from '@/app/api/news/route';

const SERVICE = 'notion-ingest';

/** Maximum number of articles accepted per ingest call */
const MAX_ARTICLES = 20;

/** Maximum body size in bytes (1 MB) */
const MAX_BODY_BYTES = 1 * 1024 * 1024;

/** Valid categories that match the frontend category tabs */
const VALID_CATEGORIES = new Set(['Latest', 'Tech & AI', 'Finance & Crypto', 'Startups']);

/**
 * Performs a constant-time string comparison to prevent timing attacks on the
 * bearer token check. Falls back to inequality on length mismatch.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Validates a single article object from the request body.
 * Returns a cleaned NewsArticle on success, null if the object is invalid.
 */
function parseArticle(raw: unknown): NewsArticle | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const title = typeof r.title === 'string' ? r.title.trim() : '';
  const url = typeof r.url === 'string' ? r.url.trim() : '';
  const snippet = typeof r.snippet === 'string' ? r.snippet.trim().slice(0, 300) : '';
  const source = typeof r.source === 'string' ? r.source.trim() : '';
  const imageUrl = typeof r.imageUrl === 'string' ? r.imageUrl.trim() : '';
  const date = typeof r.date === 'string' ? r.date.trim() : null;

  if (!title || !url || !snippet || !source) return null;

  // Require a valid HTTPS article URL
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }

  // imageUrl must be HTTPS or a data URI (gradient placeholder)
  if (imageUrl) {
    if (!imageUrl.startsWith('data:') && !imageUrl.startsWith('https://')) return null;
  }

  return {
    title,
    url,
    snippet,
    date: date ?? null,
    source,
    imageUrl: imageUrl || '',
  };
}

/**
 * POST /api/notion/ingest
 *
 * Ingests curated news articles from a Notion-connected automation.
 * Requires a valid Bearer token matching NOTION_INGEST_SECRET.
 *
 * @param req - The incoming HTTP request
 * @returns JSON result with article count ingested, or an error response
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = (process.env.NOTION_INGEST_SECRET ?? '').trim();
  if (!secret) {
    log({ level: 'error', service: SERVICE, message: 'NOTION_INGEST_SECRET not configured', requestId });
    notionIngestCounter.add(1, { status: 'auth_failed', category: 'unknown' });
    return NextResponse.json(
      { error: 'SERVICE_UNAVAILABLE', message: 'Ingest endpoint not configured.', requestId },
      { status: 503 },
    );
  }

  const authHeader = (req.headers.get('authorization') ?? '').trim();
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!provided || !timingSafeEqual(provided, secret)) {
    log({ level: 'warn', service: SERVICE, message: 'Unauthorized ingest attempt', requestId });
    notionIngestCounter.add(1, { status: 'auth_failed', category: 'unknown' });
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Invalid or missing Authorization header.', requestId },
      { status: 401 },
    );
  }

  // ── Body size guard ───────────────────────────────────────────────────────
  const contentLength = req.headers.get('content-length');
  if (contentLength) {
    const bytes = parseInt(contentLength, 10);
    if (Number.isFinite(bytes) && bytes > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 1 MB limit.', requestId },
        { status: 413 },
      );
    }
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    notionIngestCounter.add(1, { status: 'validation_error', category: 'unknown' });
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Invalid JSON body.', requestId },
      { status: 400 },
    );
  }

  if (!body || typeof body !== 'object') {
    notionIngestCounter.add(1, { status: 'validation_error', category: 'unknown' });
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Body must be a JSON object.', requestId },
      { status: 400 },
    );
  }

  const { category, articles } = body as Record<string, unknown>;

  // ── Validate category ─────────────────────────────────────────────────────
  if (typeof category !== 'string' || !VALID_CATEGORIES.has(category)) {
    notionIngestCounter.add(1, { status: 'validation_error', category: 'invalid' });
    return NextResponse.json(
      {
        error: 'VALIDATION_ERROR',
        message: `category must be one of: ${[...VALID_CATEGORIES].join(' | ')}`,
        requestId,
      },
      { status: 400 },
    );
  }

  // ── Validate articles array ───────────────────────────────────────────────
  if (!Array.isArray(articles) || articles.length === 0) {
    notionIngestCounter.add(1, { status: 'validation_error', category });
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'articles must be a non-empty array.', requestId },
      { status: 400 },
    );
  }

  if (articles.length > MAX_ARTICLES) {
    notionIngestCounter.add(1, { status: 'validation_error', category });
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: `Maximum ${MAX_ARTICLES} articles per ingest call.`, requestId },
      { status: 400 },
    );
  }

  // Parse and validate each article — silently drop invalid entries
  const valid: NewsArticle[] = articles
    .map(parseArticle)
    .filter((a): a is NewsArticle => a !== null);

  if (valid.length === 0) {
    notionIngestCounter.add(1, { status: 'validation_error', category });
    return NextResponse.json(
      {
        error: 'VALIDATION_ERROR',
        message: 'No valid articles found. Each article needs: title, url (https), snippet, source.',
        requestId,
      },
      { status: 400 },
    );
  }

  // ── Write to cache ────────────────────────────────────────────────────────
  setNotionArticles(category, valid);

  log({
    level: 'info', service: SERVICE,
    message: `Ingested ${valid.length} articles for category: ${category}`,
    requestId,
    category,
    count: valid.length,
    rejected: articles.length - valid.length,
  });

  notionIngestCounter.add(1, { status: 'success', category });

  return NextResponse.json(
    { success: true, category, count: valid.length, requestId },
    {
      status: 200,
      headers: { 'X-Request-Id': requestId },
    },
  );
}

export const dynamic = 'force-dynamic';
