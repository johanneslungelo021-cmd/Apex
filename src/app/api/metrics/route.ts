/**
 * GitHub Metrics API Endpoint
 *
 * Fetches real-time metrics from the GitHub API for the Apex repository.
 * Includes retry logic for transient failures and fallback data.
 *
 * @module app/api/metrics
 */

import { NextResponse } from 'next/server';

/**
 * GitHub API response interface for repository data.
 */
interface GitHubRepo {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  watchers_count: number;
  size: number;
  updated_at: string;
  full_name: string;
  description: string | null;
  language: string | null;
}

/**
 * Creates a fresh fallback metrics object with current timestamp.
 *
 * Factory function ensures each call returns a new object with
 * a fresh timestamp rather than a stale shared reference.
 *
 * @returns Fallback metrics object with default values
 */
function getGithubFallback() {
  return {
    stars: 1,
    forks: 0,
    openIssues: 0,
    watchers: 1,
    size: 0,
    lastUpdated: new Date().toISOString(),
    fullName: 'apex/sentient-interface',
    description: 'Apex Sentient Interface',
    language: 'TypeScript',
  };
}

/**
 * GET handler for GitHub metrics endpoint.
 *
 * Fetches repository data from GitHub API with:
 * - Authentication via GITHUB_TOKEN if available
 * - Retry logic (up to 3 attempts) for transient failures
 * - Fallback to default data on persistent errors
 *
 * @returns JSON response with GitHub and platform metrics
 *
 * @example
 * // GET /api/metrics
 * // Response:
 * {
 *   "github": { "stars": 42, "forks": 10, ... },
 *   "platform": { "users": 12480, "impact": 874200, "courses": 342 },
 *   "timestamp": 1705312800000
 * }
 */
export async function GET() {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_REPO || 'dimation/apex';

  let githubData = getGithubFallback();
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Apex-Sentient-Interface',
      };

      if (GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
      }

      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
        headers,
        next: { revalidate: 60 }, // Cache for 60 seconds
      });

      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`);
      }

      const repo: GitHubRepo = await response.json();

      githubData = {
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        openIssues: repo.open_issues_count,
        watchers: repo.watchers_count,
        size: repo.size,
        lastUpdated: repo.updated_at,
        fullName: repo.full_name,
        description: repo.description || 'Apex Sentient Interface',
        language: repo.language || 'TypeScript',
      };

      break; // Success, exit retry loop
    } catch (error) {
      attempts++;
      if (attempts >= maxAttempts) {
        console.error('GitHub metrics fetch failed after', maxAttempts, 'attempts:', error);
      } else {
        // Wait briefly before retry
        await new Promise(resolve => setTimeout(resolve, 100 * attempts));
      }
    }
  }

  // Platform metrics (simulated for Phase 1)
  const platformData = {
    users: 12480,
    impact: 874200,
    courses: 342,
  };

  return NextResponse.json({
    github: githubData,
    platform: platformData,
    timestamp: Date.now(),
  });
}
