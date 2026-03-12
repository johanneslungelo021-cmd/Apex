export const runtime = 'nodejs';

/**
 * Metrics API Route
 *
 * Returns real GitHub repository metrics sourced directly from the GitHub REST API.
 * A 5-minute server-side cache prevents rate-limit pressure on the GitHub API
 * (60 req/hr unauthenticated; 5 000 req/hr with GITHUB_TOKEN).
 *
 * NOTE: "platform metrics" (users, impact, courses) were removed in this revision
 * because the previous implementation used fabricated base values with a sine-wave
 * variation — none of those numbers reflected real usage data.  The GitHub metrics
 * below are verifiable at https://api.github.com/repos/johanneslungelo021-cmd/Apex.
 *
 * @module api/metrics
 */

import { NextResponse } from 'next/server';

/** GitHub repository metrics sourced from the GitHub REST API. */
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

/** Combined response shape returned by GET /api/metrics */
export interface MetricsResponse {
  github: GitHubMetrics;
  timestamp: number;
}

/** In-process cache — valid for 5 minutes */
let cache: { data: MetricsResponse; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1_000;

const GITHUB_REPO = 'johanneslungelo021-cmd/Apex';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}`;

const rawTimeout = parseInt(process.env.GITHUB_TIMEOUT_MS ?? '8000', 10);
const GITHUB_TIMEOUT_MS =
  Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 8_000;

function githubFallback(): GitHubMetrics {
  return {
    stars: 0,
    forks: 0,
    openIssues: 0,
    watchers: 0,
    size: 0,
    lastUpdated: new Date().toISOString(),
    fullName: GITHUB_REPO,
    description: 'Apex — AI-Powered Digital Income Platform for South Africa',
    language: 'TypeScript',
  };
}

async function fetchGitHubMetrics(): Promise<GitHubMetrics> {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Apex-Sentient-Interface',
  };

  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), GITHUB_TIMEOUT_MS);

    try {
      const res = await fetch(GITHUB_API_URL, {
        headers,
        next: { revalidate: 300 },
        signal: ac.signal,
      });

      clearTimeout(tid);

      if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (await res.json()) as Record<string, any>;

      return {
        stars: (d.stargazers_count as number) ?? 0,
        forks: (d.forks_count as number) ?? 0,
        openIssues: (d.open_issues_count as number) ?? 0,
        watchers: (d.watchers_count as number) ?? 0,
        size: (d.size as number) ?? 0,
        lastUpdated: (d.updated_at as string) ?? new Date().toISOString(),
        fullName: (d.full_name as string) ?? GITHUB_REPO,
        description:
          (d.description as string) ??
          'Apex — AI-Powered Digital Income Platform for South Africa',
        language: (d.language as string) ?? 'TypeScript',
      };
    } catch (err) {
      clearTimeout(tid);
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 2) {
        console.warn(`[metrics] GitHub fetch failed after 2 attempts: ${msg}`);
        return githubFallback();
      }
      console.warn(`[metrics] GitHub fetch attempt ${attempt} failed, retrying: ${msg}`);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return githubFallback();
}

export async function GET(): Promise<Response> {
  const now = Date.now();

  if (cache && now - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const github = await fetchGitHubMetrics();
  const body: MetricsResponse = { github, timestamp: now };
  cache = { data: body, ts: now };

  return NextResponse.json(body);
}

export const revalidate = 300;
