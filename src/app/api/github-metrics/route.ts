export const runtime = 'nodejs';

/**
 * GitHub Metrics API Route
 * 
 * Fetches repository metrics from the GitHub API with caching support.
 * Provides stars, forks, issues, watchers, and other repository statistics.
 * 
 * @module api/github-metrics
 */

import { NextResponse } from 'next/server';

/** Target GitHub repository for metrics collection */
const GITHUB_REPO = 'johanneslungelo021-cmd/Apex';

/** GitHub API endpoint for repository data */
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}`;

/**
 * GitHub repository metrics response structure.
 */
interface GitHubMetricsData {
  /** Number of repository stars */
  stars: number;
  /** Number of repository forks */
  forks: number;
  /** Number of open issues */
  openIssues: number;
  /** Number of repository watchers */
  watchers: number;
  /** Repository size in kilobytes */
  size: number;
  /** ISO timestamp of last update */
  lastUpdated: string;
  /** Full repository name (owner/repo) */
  fullName: string;
  /** Repository description */
  description: string;
  /** Primary programming language */
  language: string;
  /** Error message if fetch failed */
  error?: string;
}

/** Cache for GitHub metrics with 5-minute TTL */
let cachedMetrics: {
  data: GitHubMetricsData | null;
  timestamp: number;
} = { data: null, timestamp: 0 };

/** Cache time-to-live in milliseconds (5 minutes) */
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Handles GET requests for GitHub repository metrics.
 * 
 * Returns cached data if still valid, otherwise fetches fresh data from
 * the GitHub API. Supports optional authentication via GITHUB_TOKEN env
 * variable for higher rate limits (5000 req/hr vs 60 req/hr unauthenticated).
 * 
 * @returns JSON response with repository metrics
 * 
 * @example
 * // Request
 * GET /api/github-metrics
 * 
 * // Success response
 * {
 *   "stars": 42,
 *   "forks": 10,
 *   "openIssues": 5,
 *   "watchers": 20,
 *   "size": 1024,
 *   "lastUpdated": "2024-01-15T10:30:00Z",
 *   "fullName": "johanneslungelo021-cmd/Apex",
 *   "description": "Apex - Sentient Interface",
 *   "language": "TypeScript"
 * }
 * 
 * // Error response (API unavailable)
 * {
 *   "stars": 0,
 *   "error": "GitHub API unavailable",
 *   ...
 * }
 */
export async function GET(): Promise<Response> {
  try {
    // Check cache first
    const now = Date.now();
    if (cachedMetrics.data && (now - cachedMetrics.timestamp) < CACHE_TTL) {
      return NextResponse.json(cachedMetrics.data);
    }

    // Fetch from GitHub API
    const headers: HeadersInit = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Apex-Sentient-Interface',
    };

    // Add auth token if available (for higher rate limits)
    const githubToken = process.env.GITHUB_TOKEN;
    if (githubToken) {
      headers['Authorization'] = `token ${githubToken}`;
    }

    const response = await fetch(GITHUB_API_URL, { headers });

    if (!response.ok) {
      // Return cached data if available, otherwise return defaults
      if (cachedMetrics.data) {
        return NextResponse.json(cachedMetrics.data);
      }
      return NextResponse.json({
        stars: 0,
        forks: 0,
        openIssues: 0,
        watchers: 0,
        size: 0,
        lastUpdated: new Date().toISOString(),
        fullName: GITHUB_REPO,
        description: 'Apex - Sentient Interface',
        language: 'TypeScript',
        error: 'GitHub API unavailable',
      });
    }

    const repoData = await response.json();

    // Parse and format metrics
    const metrics: GitHubMetricsData = {
      stars: repoData.stargazers_count || 0,
      forks: repoData.forks_count || 0,
      openIssues: repoData.open_issues_count || 0,
      watchers: repoData.watchers_count || 0,
      size: repoData.size || 0,
      lastUpdated: repoData.updated_at || new Date().toISOString(),
      fullName: repoData.full_name || GITHUB_REPO,
      description: repoData.description || 'Apex - Sentient Interface',
      language: repoData.language || 'TypeScript',
    };

    // Update cache
    cachedMetrics = { data: metrics, timestamp: now };

    return NextResponse.json(metrics);
  } catch (error) {
    console.error('GitHub metrics error:', error);
    
    // Return cached data if available
    if (cachedMetrics.data) {
      return NextResponse.json(cachedMetrics.data);
    }

    return NextResponse.json({
      stars: 0,
      forks: 0,
      openIssues: 0,
      watchers: 0,
      size: 0,
      lastUpdated: new Date().toISOString(),
      fullName: GITHUB_REPO,
      description: 'Apex - Sentient Interface',
      language: 'TypeScript',
      error: 'Failed to fetch GitHub metrics',
    });
  }
}

/** Force dynamic rendering to ensure fresh data */
export const dynamic = 'force-dynamic';
