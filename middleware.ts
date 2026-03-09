/**
 * Next.js Middleware — GEO Content Negotiation
 *
 * Intercepts requests to classify the caller as human, AI assistant,
 * search crawler, or data scraper. Based on classification:
 *
 * 1. AI assistants + search crawlers requesting insight/home pages
 *    → Rewritten internally to /api/mx/[slug] (Markdown shadow-route)
 *    → URL stays the same (transparent to the caller)
 *
 * 2. All requests get enriched with X-Agent-Role and X-Agent-Name headers
 *    so downstream route handlers can access the classification.
 *
 * 3. Data scrapers receive an advisory Crawl-Delay header (supported by
 *    Anthropic's ClaudeBot per their official documentation).
 *
 * The rewrite only happens for Accept: text/markdown or known AI UAs.
 * Regular browsers are never redirected — they always see the React UI.
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/middleware
 * @module middleware
 */

import { NextResponse, type NextRequest } from 'next/server';
import { classifyAgent, wantsMarkdown, isDataScraper } from '@/lib/geo/agent-classifier';

export const config = {
  // Run middleware on the main page and insight routes only.
  // Exclude static assets, API routes (except home page), and Next.js internals.
  matcher: [
    '/',
    '/insights/:path*',
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};

export function middleware(request: NextRequest) {
  const ua = request.headers.get('user-agent') ?? '';
  const accept = request.headers.get('accept') ?? '';

  const agent = classifyAgent(ua, accept);

  // Build response headers for downstream access
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('X-Agent-Role', agent.role);
  requestHeaders.set('X-Agent-Name', agent.name);

  // ── Markdown content negotiation ────────────────────────────────────────────
  // Rewrite AI assistants and search crawlers to the Markdown shadow-route.
  // Human browsers are never affected.
  if (wantsMarkdown(agent)) {
    const { pathname } = request.nextUrl;

    // Map pathname to a Markdown slug
    const slug = resolveMarkdownSlug(pathname);

    if (slug) {
      const rewriteUrl = new URL(`/api/mx/${slug}`, request.url);
      const rewritten = NextResponse.rewrite(rewriteUrl, {
        request: { headers: requestHeaders },
      });

      // Pass classification headers through to the response
      rewritten.headers.set('X-Agent-Role', agent.role);
      rewritten.headers.set('X-Agent-Name', agent.name);
      rewritten.headers.set('X-GEO-Rewritten', '1');

      return rewritten;
    }
  }

  // ── Pass-through with enriched headers ──────────────────────────────────────
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set('X-Agent-Role', agent.role);
  response.headers.set('X-Agent-Name', agent.name);

  // Advisory crawl-delay for training data scrapers (Anthropic supports this)
  if (isDataScraper(agent)) {
    response.headers.set('X-Crawl-Delay', '1');
  }

  return response;
}

// ─── Pathname → Slug Mapping ──────────────────────────────────────────────────

/**
 * Maps an incoming pathname to the appropriate Markdown shadow-route slug.
 * Returns null when no Markdown shadow exists for the path.
 */
function resolveMarkdownSlug(pathname: string): string | null {
  // Home page
  if (pathname === '/' || pathname === '') return 'home';

  // /insights/* → memory (AI assistants asking about platform details)
  if (pathname.startsWith('/insights')) return 'memory';

  // /about → about
  if (pathname === '/about') return 'about';

  // /opportunities → opportunities
  if (pathname.startsWith('/opportunities')) return 'opportunities';

  return null;
}
