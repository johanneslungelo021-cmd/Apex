/**
 * Web Search Adapter
 *
 * Provides web search via the Perplexity Sonar API.
 * Falls back to Groq (no web access) if PERPLEXITY_API_KEY is not set.
 *
 * The `skills/web-search/` directory contains a standalone z-ai-web-dev-sdk
 * script for the Claude sandbox. This adapter uses the real Perplexity API
 * so the Next.js build succeeds on Vercel.
 *
 * @module lib/skills/web-search
 */

import { fetchWithTimeout } from '@/lib/api-utils';

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
 * Searches the web using Perplexity Sonar.
 * Returns up to `numResults` structured results.
 *
 * @example
 * ```ts
 * const result = await webSearch({ query: 'side hustles South Africa 2025' });
 * if (result.success) console.log(result.results);
 * ```
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

    // Strip markdown fences if present
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
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { results: [], success: false, error: errorMessage };
  }
}
