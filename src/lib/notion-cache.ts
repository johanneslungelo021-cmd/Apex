/**
 * Notion News Cache
 *
 * In-memory store for news articles ingested via POST /api/notion/ingest.
 * Shared between the ingest endpoint and the news route so that Notion-sourced
 * content takes priority over the Perplexity fallback.
 *
 * TTL: 30 minutes. Notion content is curated and refreshed on demand via
 * automation, so a longer TTL than Perplexity (10 min) is appropriate.
 *
 * This module is a singleton — Next.js module caching ensures only one
 * instance exists per server process (per Vercel function warm instance).
 *
 * @module lib/notion-cache
 */

import type { NewsArticle } from '@/app/api/news/route';

/** Notion cache TTL — 30 minutes */
export const NOTION_CACHE_TTL_MS = 30 * 60 * 1000;

export interface NotionCacheEntry {
  articles: NewsArticle[];
  /** Unix ms timestamp when this entry was last written */
  ingestedAt: number;
  /** Number of articles in this entry for quick observability */
  count: number;
}

/**
 * Per-category Notion article cache.
 * Keyed by the exact category string: 'Latest' | 'Tech & AI' | 'Finance & Crypto' | 'Startups'
 *
 * The news route reads from this map; the ingest route writes to it.
 * A Map is used (not a plain object) to avoid prototype-pollution concerns.
 */
export const notionCache = new Map<string, NotionCacheEntry>();

/**
 * Returns the cached Notion articles for a category if they exist and are still
 * within the TTL window. Returns null if the cache is empty or stale.
 *
 * @param category - The news category key
 * @returns The cached articles array, or null on miss/stale
 */
export function getNotionArticles(category: string): NewsArticle[] | null {
  const entry = notionCache.get(category);
  if (!entry) return null;
  if (Date.now() - entry.ingestedAt > NOTION_CACHE_TTL_MS) {
    notionCache.delete(category);
    return null;
  }
  return entry.articles;
}

/**
 * Writes a set of articles for a category into the Notion cache.
 * Overwrites any existing entry for that category.
 *
 * @param category - The news category key
 * @param articles - The articles to cache
 */
export function setNotionArticles(category: string, articles: NewsArticle[]): void {
  notionCache.set(category, {
    articles,
    ingestedAt: Date.now(),
    count: articles.length,
  });
}
