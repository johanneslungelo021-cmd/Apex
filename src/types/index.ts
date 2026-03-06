/**
 * Shared Domain Types
 *
 * Single source of truth for interfaces shared between the frontend
 * page component and backend API modules.
 *
 * Import from '@/types' in any consumer:
 *   import type { Opportunity, NewsArticle } from '@/types';
 *
 * @module types
 */

/** GitHub repository metrics returned by /api/metrics. */
export interface GitHubMetrics {
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  size: number;
  lastUpdated: string;
  fullName: string;
  description: string;
  language: string;
}

/** Platform-level aggregate metrics (users, revenue impact, courses). */
export interface PlatformMetrics {
  users: number;
  impact: number;
  courses: number;
}

/** Combined response shape from /api/metrics. */
export interface CombinedMetrics {
  github: GitHubMetrics;
  platform: PlatformMetrics;
  timestamp: number;
}

/**
 * A validated digital income opportunity produced by the Scout Agent.
 * All text fields are non-empty; link is always a reachable HTTPS URL.
 */
export interface Opportunity {
  title: string;
  province: string;
  cost: number;
  incomePotential: string;
  link: string;
  category: string;
}

/**
 * A live news article returned by /api/news (Perplexity Search).
 * imageUrl is always a valid absolute URL or a base64 SVG gradient placeholder.
 */
export interface NewsArticle {
  title: string;
  url: string;
  snippet: string;
  date: string | null;
  source: string;
  imageUrl: string;
}
