/**
 * Blogs API — SA Digital Economy Articles via Perplexity Sonar
 *
 * Generates real, researched blog articles about SA digital income,
 * freelancing, tech skills, and startup opportunities.
 * 30-minute cache — content stays relevant but refreshes regularly.
 */

import { NextResponse } from 'next/server';
import { log, generateRequestId, fetchWithTimeout } from '@/lib/api-utils';

const SERVICE = 'blogs-api';
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  readTime: number;
  tags: string[];
  publishedAt: string;
}

const BLOG_CATEGORIES = [
  'Freelancing',
  'Digital Skills',
  'Startups',
  'Crypto & DeFi',
  'E-commerce',
];

let cache: { posts: BlogPost[]; cachedAt: number } | null = null;

async function generateBlogPosts(requestId: string): Promise<BlogPost[]> {
  const apiKey = process.env.PERPLEXITY_API_KEY ?? process.env.GROQ_API_KEY;
  const isPerplexity = !!process.env.PERPLEXITY_API_KEY;

  if (!apiKey) throw new Error('No AI API key configured');

  const endpoint = isPerplexity
    ? 'https://api.perplexity.ai/chat/completions'
    : 'https://api.groq.com/openai/v1/chat/completions';

  const model = isPerplexity ? 'sonar' : 'llama-3.1-8b-instant';

  const today = new Date().toISOString().split('T')[0];

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
        max_tokens: 1500,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content:
              'You are a South African digital economy journalist. Generate real, practical blog posts for South Africans looking to earn money digitally. ' +
              'Return ONLY a valid JSON array of 4 blog post objects — no markdown, no code fences. ' +
              'Each object must have: "id" (unique slug string), "title" (string), "excerpt" (2-sentence summary, string), ' +
              '"content" (3-4 paragraph article body, string), "category" (one of: Freelancing, Digital Skills, Startups, Crypto & DeFi, E-commerce), ' +
              '"readTime" (number of minutes), "tags" (array of 3-4 strings), "publishedAt" (ISO date string today). ' +
              'Write about real SA platforms, real ZAR amounts, real opportunities. Return ONLY the JSON array.',
          },
          {
            role: 'user',
            content: `Generate 4 fresh blog posts about South African digital income opportunities as of ${today}. Cover different categories. Include real platform names, ZAR earning ranges, and actionable steps.`,
          },
        ],
      }),
    },
    20_000,
  );

  if (!response.ok) throw new Error(`API returned ${response.status}`);

  const raw = await response.json();
  const content: string = raw?.choices?.[0]?.message?.content ?? '[]';
  const cleaned = content.replace(/```json|```/g, '').trim();
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!arrMatch) throw new Error('No JSON array in response');

  const parsed = JSON.parse(arrMatch[0]) as BlogPost[];
  if (!Array.isArray(parsed)) throw new Error('Response is not an array');

  log({ level: 'info', service: SERVICE, message: `Generated ${parsed.length} blog posts`, requestId });
  return parsed.slice(0, 4);
}

export async function GET(): Promise<Response> {
  const requestId = generateRequestId();

  if (cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ posts: cache.posts }, {
      headers: { 'Cache-Control': 'public, max-age=1800', 'X-Cache': 'HIT' },
    });
  }

  try {
    const posts = await generateBlogPosts(requestId);
    cache = { posts, cachedAt: Date.now() };
    return NextResponse.json({ posts }, {
      headers: { 'Cache-Control': 'public, max-age=1800', 'X-Cache': 'MISS' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({ level: 'error', service: SERVICE, message: 'Blog generation failed', requestId, error: msg });

    if (cache) {
      return NextResponse.json({ posts: cache.posts, stale: true }, {
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    }

    return NextResponse.json(
      { error: 'GENERATION_FAILED', message: 'Blog content unavailable right now.' },
      { status: 503 },
    );
  }
}

export { BLOG_CATEGORIES };
