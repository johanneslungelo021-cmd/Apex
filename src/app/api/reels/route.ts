/**
 * Reels API — SA Creator Economy Video Ideas via Perplexity Sonar
 *
 * Generates trending video concepts, scripts, and hooks for South African
 * content creators on TikTok, YouTube Shorts, and Instagram Reels.
 * 20-minute cache.
 */

import { NextResponse } from 'next/server';
import { log, generateRequestId, fetchWithTimeout } from '@/lib/api-utils';

const SERVICE = 'reels-api';
const CACHE_TTL_MS = 20 * 60 * 1000;

export interface ReelIdea {
  id: string;
  title: string;
  hook: string;
  script: string;
  platform: 'TikTok' | 'YouTube Shorts' | 'Instagram Reels' | 'All Platforms';
  niche: string;
  estimatedViews: string;
  earningPotential: string;
  hashtags: string[];
  duration: number;
  trending: boolean;
}

let cache: { ideas: ReelIdea[]; cachedAt: number } | null = null;

async function generateReelIdeas(requestId: string): Promise<ReelIdea[]> {
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
        temperature: 0.5,
        messages: [
          {
            role: 'system',
            content:
              'You are a South African content creator strategist. Generate viral reel ideas for SA creators who want to earn from content. ' +
              'Return ONLY a valid JSON array of 5 reel idea objects — no markdown, no code fences. ' +
              'Each object must have: "id" (slug string), "title" (string), "hook" (first 3 seconds script, string), ' +
              '"script" (full 30-60 second script outline, string), ' +
              '"platform" (one of: TikTok, YouTube Shorts, Instagram Reels, All Platforms), ' +
              '"niche" (string, e.g. "Personal Finance"), "estimatedViews" (string, e.g. "50K-200K"), ' +
              '"earningPotential" (string, e.g. "R500-R3000/month from monetisation"), ' +
              '"hashtags" (array of 5 strings without #), ' +
              '"duration" (number in seconds), "trending" (boolean). ' +
              'Focus on SA-relevant niches: township business, load shedding hacks, budget cooking, SA crypto, side hustles, Afrikaans content, etc. ' +
              'Return ONLY the JSON array.',
          },
          {
            role: 'user',
            content: `Generate 5 trending reel ideas for South African content creators as of ${today}. Include what's actually trending in SA right now. Focus on content that can earn money.`,
          },
        ],
      }),
    },
    18_000,
  );

  if (!response.ok) throw new Error(`API returned ${response.status}`);

  const raw = await response.json();
  const content: string = raw?.choices?.[0]?.message?.content ?? '[]';
  const cleaned = content.replace(/```json|```/g, '').trim();
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!arrMatch) throw new Error('No JSON array in response');

  const parsed = JSON.parse(arrMatch[0]) as ReelIdea[];
  if (!Array.isArray(parsed)) throw new Error('Response is not an array');

  log({ level: 'info', service: SERVICE, message: `Generated ${parsed.length} reel ideas`, requestId });
  return parsed.slice(0, 5);
}

export async function GET(): Promise<Response> {
  const requestId = generateRequestId();

  if (cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ ideas: cache.ideas }, {
      headers: { 'Cache-Control': 'public, max-age=1200', 'X-Cache': 'HIT' },
    });
  }

  try {
    const ideas = await generateReelIdeas(requestId);
    cache = { ideas, cachedAt: Date.now() };
    return NextResponse.json({ ideas }, {
      headers: { 'Cache-Control': 'public, max-age=1200', 'X-Cache': 'MISS' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({ level: 'error', service: SERVICE, message: 'Reel generation failed', requestId, error: msg });

    if (cache) {
      return NextResponse.json({ ideas: cache.ideas, stale: true }, {
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    }

    return NextResponse.json(
      { error: 'GENERATION_FAILED', message: 'Reel ideas unavailable right now.' },
      { status: 503 },
    );
  }
}
