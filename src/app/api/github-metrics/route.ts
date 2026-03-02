import { NextResponse } from 'next/server';

// GitHub API configuration
const GITHUB_REPO = 'johanneslungelo021-cmd/Apex';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}`;

// Cache for GitHub metrics (5 minute TTL)
let cachedMetrics: {
  data: {
    stars: number;
    forks: number;
    openIssues: number;
    watchers: number;
    size: number;
    lastUpdated: string;
    fullName: string;
    description: string;
    language: string;
  } | null;
  timestamp: number;
} = { data: null, timestamp: 0 };

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
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
    const metrics = {
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

// Force dynamic rendering
export const dynamic = 'force-dynamic';
