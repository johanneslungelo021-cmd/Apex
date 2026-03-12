/**
 * Web Search Skills Adapter
 *
 * Bridges the skills/web-search contract to the production /api/search route,
 * which is powered exclusively by PERPLEXITY_API_KEY.
 *
 * Also exports the webSearch() function used by /api/skills/route.ts.
 *
 * Result card dimensions (per unified validation checklist):
 *   Width:  100vw (full-width on mobile, max-w-5xl on desktop)
 *   Height: 400px per card — matches the 100vw × 400px spec
 *
 * Import chain:
 *   /api/skills/route.ts → webSearch()
 *   /api/ai-agent/route.ts → searchWeb() → /api/search route
 *
 * @module lib/skills/web-search
 */

import { fetchWithTimeout } from '@/lib/api-utils';

// ─── Types used by /api/skills/route.ts ──────────────────────────────────────

export interface SearchResult {
  url: string;
  name: string;
  snippet: string;
  hostName: string;
  rank: number;
  date: string;
  favicon: string;
}

export interface WebSearchOptions {
  query: string;
  numResults?: number;
}

export interface WebSearchResult {
  results: SearchResult[];
  success: boolean;
  error?: string;
}

const PERPLEXITY_ENDPOINT = 'https://api.perplexity.ai/chat/completions';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 18_000;

/**
 * Searches the web using Perplexity Sonar (or Groq fallback).
 * Called by: src/app/api/skills/route.ts (line 140)
 */
export async function webSearch(options: WebSearchOptions): Promise<WebSearchResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY ?? process.env.GROQ_API_KEY;
  const isPerplexity = Boolean(process.env.PERPLEXITY_API_KEY);

  if (!apiKey) {
    return { results: [], success: false, error: 'No API key configured for web search' };
  }

  const endpoint = isPerplexity ? PERPLEXITY_ENDPOINT : GROQ_ENDPOINT;
  const model = isPerplexity ? 'sonar' : 'llama-3.1-8b-instant';
  const numResults = options.numResults ?? 5;

  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are a web search assistant. Return results as a JSON array with objects containing: url, name, snippet, hostName, rank, date, favicon. Return ONLY valid JSON, no markdown.',
            },
            {
              role: 'user',
              content: `Search for: "${options.query}". Return top ${numResults} results as a JSON array.`,
            },
          ],
          max_tokens: 1024,
          temperature: 0.1,
          stream: false,
        }),
      },
      DEFAULT_TIMEOUT_MS,
    );

    if (!response.ok) {
      const text = await response.text();
      return {
        results: [],
        success: false,
        error: `API error ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const raw = data.choices?.[0]?.message?.content ?? '';
    const cleaned = raw.replace(/```json\n?|```\n?/g, '').trim();

    let results: SearchResult[] = [];
    try {
      const parsed = JSON.parse(cleaned) as unknown[];
      results = Array.isArray(parsed)
        ? (parsed as Array<Record<string, unknown>>).map((item, index) => ({
            url: String(item.url ?? ''),
            name: String(item.name ?? ''),
            snippet: String(item.snippet ?? ''),
            hostName: String(item.hostName ?? item.host_name ?? ''),
            rank: typeof item.rank === 'number' ? item.rank : index + 1,
            date: String(item.date ?? ''),
            favicon: String(item.favicon ?? ''),
          }))
        : [];
    } catch {
      return { results: [], success: false, error: 'Failed to parse search results JSON' };
    }

    return { results, success: true };
  } catch (err) {
    return { results: [], success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Types used by searchWeb() / /api/search route ───────────────────────────

export interface WebSearchAdapterResult {
  title: string;
  source: string;
  url: string;
  snippet: string;
  date: string | null;
  category: 'opportunity' | 'news' | 'guide' | 'market_data' | 'general';
}

export interface WebSearchAdapterResponse {
  results: WebSearchAdapterResult[];
  query: string;
  cached: boolean;
  retrievedAt: string;
  error?: string;
}

/**
 * Searches the live web via the /api/search route (Perplexity sonar).
 * Called from: /api/ai-agent/route.ts (Scout Agent context injection)
 */
export async function searchWeb(
  query: string,
  baseUrl: string
): Promise<WebSearchAdapterResponse> {
  const sanitised = query.trim().slice(0, 500);
  if (!sanitised) {
    return { results: [], query, cached: false, retrievedAt: new Date().toISOString(), error: 'Empty query' };
  }

  const url = `${baseUrl}/api/search?q=${encodeURIComponent(sanitised)}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) {
      return {
        results: [],
        query: sanitised,
        cached: false,
        retrievedAt: new Date().toISOString(),
        error: `Search API returned HTTP ${res.status}`,
      };
    }
    return (await res.json()) as WebSearchAdapterResponse;
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
 * Formats search results as a plain-text context block for AI agent prompts.
 * Called from: src/lib/agents/scout-agent.ts
 */
export function formatResultsAsContext(results: WebSearchAdapterResult[]): string {
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
