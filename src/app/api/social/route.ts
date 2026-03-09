/**
 * Social Media API — SA Brand Content Generation
 *
 * Generates ready-to-post captions, hashtag sets, and content calendars
 * for South African businesses and personal brands.
 * POST: generate content for a specific niche/platform
 * GET: return example generated content
 */

import { NextResponse } from 'next/server';
import { log, generateRequestId, fetchWithTimeout, checkRateLimit } from '@/lib/api-utils';

const SERVICE = 'social-api';
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;

export interface SocialPost {
  platform: 'Twitter/X' | 'LinkedIn' | 'Facebook' | 'Instagram' | 'TikTok';
  caption: string;
  hashtags: string[];
  callToAction: string;
  bestPostTime: string;
  engagementTip: string;
}

export interface SocialPackage {
  niche: string;
  posts: SocialPost[];
  weeklyCalendar: { day: string; theme: string; platform: string }[];
  generatedAt: string;
}

async function generateSocialContent(niche: string, requestId: string): Promise<SocialPackage> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not configured');

  const response = await fetchWithTimeout(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 1200,
        temperature: 0.6,
        messages: [
          {
            role: 'system',
            content:
              'You are a South African social media strategist. Generate ready-to-post social content for SA businesses. ' +
              'Return ONLY a valid JSON object — no markdown, no code fences. ' +
              'The object must have: "niche" (string), ' +
              '"posts" (array of 4 post objects, each with: "platform" (one of: Twitter/X, LinkedIn, Facebook, Instagram, TikTok), ' +
              '"caption" (post text, SA English, authentic voice), "hashtags" (array of 5-8 strings without #), ' +
              '"callToAction" (string), "bestPostTime" (string e.g. "7-9am SAST"), "engagementTip" (string)), ' +
              '"weeklyCalendar" (array of 7 objects, each with "day" string, "theme" string, "platform" string), ' +
              '"generatedAt" (ISO string). ' +
              'Use South African context, slang where appropriate, local hashtags, and ZAR pricing where relevant. ' +
              'Return ONLY the JSON object.',
          },
          {
            role: 'user',
            content: `Generate a social media content package for a South African "${niche}" brand. Create authentic SA-voice captions and a weekly posting calendar.`,
          },
        ],
      }),
    },
    15_000,
  );

  if (!response.ok) throw new Error(`Groq returned ${response.status}`);

  const raw = await response.json();
  const content: string = raw?.choices?.[0]?.message?.content ?? '{}';
  const cleaned = content.replace(/```json|```/g, '').trim();
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!objMatch) throw new Error('No JSON object in response');

  const parsed = JSON.parse(objMatch[0]) as SocialPackage;
  log({ level: 'info', service: SERVICE, message: `Generated social package for "${niche}"`, requestId });
  return parsed;
}

const EXAMPLE_NICHES = [
  'Side Hustle Coach',
  'Township Food Business',
  'Digital Skills Tutor',
  'SA Crypto Trader',
  'Freelance Designer',
];

export async function GET(): Promise<Response> {
  return NextResponse.json({
    description: 'SA Social Media Content Generator',
    usage: 'POST /api/social with { "niche": "your business type" }',
    exampleNiches: EXAMPLE_NICHES,
    platforms: ['Twitter/X', 'LinkedIn', 'Facebook', 'Instagram', 'TikTok'],
  });
}

export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  if (!checkRateLimit(ip, RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Too many requests. Wait before retrying.' },
      { status: 429, headers: { 'X-Request-Id': requestId } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const niche = (body as Record<string, unknown>)?.niche;
  if (typeof niche !== 'string' || !niche.trim() || niche.length > 100) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: '"niche" must be a non-empty string under 100 chars.' },
      { status: 400 },
    );
  }

  try {
    const pkg = await generateSocialContent(niche.trim(), requestId);
    return NextResponse.json(pkg, {
      headers: { 'X-Request-Id': requestId },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({ level: 'error', service: SERVICE, message: 'Social generation failed', requestId, error: msg });
    return NextResponse.json(
      { error: 'GENERATION_FAILED', message: 'Content generation unavailable right now.' },
      { status: 503, headers: { 'X-Request-Id': requestId } },
    );
  }
}
