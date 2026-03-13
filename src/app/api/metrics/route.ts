import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Metrics API Route — real GitHub repository data only
 *
 * Returns live repository metrics from the GitHub REST API.
 * A 5-minute server-side cache and a single-flight pattern prevent
 * rate-limit pressure and redundant concurrent fetches.
 */

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

export interface MetricsResponse {
  github: GitHubMetrics;
  timestamp: number;
}

let cache: { data: MetricsResponse; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1_000;

// Single-flight pattern: track ongoing request to prevent concurrent duplicate fetches
let pendingRequest: Promise<GitHubMetrics> | null = null;

const GITHUB_REPO = 'johanneslungelo021-cmd/Apex';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}`;
const GITHUB_TIMEOUT_MS = 8_000;

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
  if (token) headers['Authorization'] = `token ${token}`;

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

      const d = await res.json();
      return {
        stars: d.stargazers_count ?? 0,
        forks: d.forks_count ?? 0,
        openIssues: d.open_issues_count ?? 0,
        watchers: d.watchers_count ?? 0,
        size: d.size ?? 0,
        lastUpdated: d.updated_at ?? new Date().toISOString(),
        fullName: d.full_name ?? GITHUB_REPO,
        description: d.description ?? 'Apex — AI-Powered Digital Income Platform',
        language: d.language ?? 'TypeScript',
      };
    } catch (err) {
      clearTimeout(tid);
      if (attempt === 2) {
        console.warn(`[metrics] GitHub fetch failed: ${err}`);
        return githubFallback();
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return githubFallback();
}

export async function GET(): Promise<Response> {
  const now = Date.now();

  // 1. Check cache
  if (cache && now - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  // 2. Single-flight: If a request is already in flight, wait for it
  if (pendingRequest) {
    const github = await pendingRequest;
    return NextResponse.json({ github, timestamp: now });
  }

  // 3. Start new fetch and track it
  try {
    pendingRequest = fetchGitHubMetrics();
    const github = await pendingRequest;
    const body: MetricsResponse = { github, timestamp: now };
    cache = { data: body, ts: now };
    return NextResponse.json(body);
  } finally {
    pendingRequest = null;
  }
}

export const revalidate = 300;