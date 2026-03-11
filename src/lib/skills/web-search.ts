/**
 * Web Search Adapter
 *
 * Provides web search functionality using z-ai-web-dev-sdk.
 * This adapter wraps the SDK's web_search function invocation.
 *
 * @module lib/skills/web-search
 */

import ZAI from 'z-ai-web-dev-sdk';

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

/**
 * Performs a web search using the z-ai-web-dev-sdk.
 *
 * @example
 * ```ts
 * const result = await webSearch({
 *   query: 'South Africa digital economy 2024',
 *   numResults: 5
 * });
 * ```
 */
export async function webSearch(
  options: WebSearchOptions
): Promise<WebSearchResult> {
  try {
    const zai = await ZAI.create();

    const searchResult = await zai.functions.invoke('web_search', {
      query: options.query,
      num: options.numResults ?? 10,
    });

    if (!Array.isArray(searchResult)) {
      return {
        results: [],
        success: false,
        error: 'Unexpected response format from web search',
      };
    }

    const results: SearchResult[] = searchResult.map((item) => ({
      url: item.url ?? '',
      name: item.name ?? '',
      snippet: item.snippet ?? '',
      hostName: item.host_name ?? '',
      rank: item.rank ?? 0,
      date: item.date ?? '',
      favicon: item.favicon ?? '',
    }));

    return {
      results,
      success: true,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      results: [],
      success: false,
      error: errorMessage,
    };
  }
}
