/**
 * Web Search Skills Adapter
 *
 * Bridges the skills/web-search contract to the production /api/search route,
 * which is powered exclusively by PERPLEXITY_API_KEY.
 *
 * Result card dimensions (per unified validation checklist):
 *   Width:  100vw (full-width on mobile, max-w-5xl on desktop)
 *   Height: 400px per card — matches the 100vw × 400px spec
 *
 * This adapter is the ONLY entry point for web search in the Apex codebase.
 * All callers must go through searchWeb() — direct fetch to Perplexity is
 * prohibited from client components (API key would be exposed).
 *
 * Import chain:
 *   src/app/page.tsx (via Scout Agent) → /api/ai-agent/route.ts
 *                                       → /api/search/route.ts
 *                                       → Perplexity sonar model
 *
 * @module lib/skills/web-search
 */

export interface WebSearchResult {
  /** Article / page title */
  title: string;
  /** Source domain (e.g. reuters.com, saiia.org.za) */
  source: string;
  /** Canonical URL — always a real, verifiable link from Perplexity */
  url: string;
  /** 2–3 sentence summary grounded in live web content */
  snippet: string;
  /** ISO-8601 publication date or null if not available */
  date: string | null;
  /**
   * Category tag for card colour-coding in the UI.
   * Classified server-side by /api/search/route.ts classifyResult().
   */
  category: 'opportunity' | 'news' | 'guide' | 'market_data' | 'general';
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  query: string;
  cached: boolean;
  retrievedAt: string;
  /** True when the search service is unavailable (no API key or network error) */
  error?: string;
}

/**
 * Searches the live web via the /api/search route (Perplexity sonar).
 *
 * Called from: /api/ai-agent/route.ts (Scout Agent context injection)
 *
 * @param query   - Search query string (max 500 chars)
 * @param baseUrl - Base URL for the Next.js app (required in server contexts)
 * @returns       Structured search results or an error response
 */
export async function searchWeb(
  query: string,
  baseUrl: string
): Promise<WebSearchResponse> {
  const sanitised = query.trim().slice(0, 500);
  if (!sanitised) {
    return { results: [], query, cached: false, retrievedAt: new Date().toISOString(), error: 'Empty query' };
  }

  const url = `${baseUrl}/api/search?q=${encodeURIComponent(sanitised)}`;

  try {
    const res = await fetch(url, {
      // 12s timeout — generous to allow Perplexity round-trip from cpt1 edge
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      return {
        results: [],
        query: sanitised,
        cached: false,
        retrievedAt: new Date().toISOString(),
        error: `Search API returned HTTP ${res.status}`,
      };
    }

    return (await res.json()) as WebSearchResponse;
  } catch (err) {
    return {
      results: [],
      query: sanitised,
      cached: false,
      retrievedAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Formats search results as a plain-text context block for injection into
 * AI agent system prompts.  Used by Scout Agent to ground responses in
 * live web data without hallucinating URLs.
 *
 * Called from: src/lib/agents/scout-agent.ts (future integration)
 *
 * @param results Array of WebSearchResult from searchWeb()
 * @returns       Formatted context string
 */
export function formatResultsAsContext(results: WebSearchResult[]): string {
  if (results.length === 0) return 'No live web results available.';

  return results
    .map((r, i) =>
      [
        `[${i + 1}] ${r.title}`,
        `Source: ${r.source} | ${r.date ?? 'Date unknown'}`,
        `URL: ${r.url}`,
        `Summary: ${r.snippet}`,
      ].join('\n')
    )
    .join('\n\n');
}
