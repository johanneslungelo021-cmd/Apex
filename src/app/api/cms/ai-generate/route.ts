export const runtime = 'nodejs';
/**
 * CMS AI Generation — proxies to existing Apex AI agent infrastructure
 * POST /api/cms/ai-generate
 * { type: 'title'|'excerpt'|'content'|'seo'|'tags'|'rewrite'|'expand', prompt, context, tone, length }
 */
import { NextResponse } from 'next/server';
import { log, generateRequestId } from '@/lib/api-utils';
import { getTokenFromRequest, verifySession } from '@/lib/auth/session';

const SERVICE = 'cms-ai-generate';

const SYSTEM_PROMPTS: Record<string, string> = {
  title: 'You are an expert content writer. Generate 3 compelling, SEO-friendly article titles. Return JSON: {"result": "Best title", "alternatives": ["Title 2", "Title 3"]}',
  excerpt: 'You are a content editor. Write a compelling 1-2 sentence excerpt/summary. Return JSON: {"result": "The excerpt", "alternatives": []}',
  content: 'You are a professional content writer for South African creators. Write engaging, well-structured article content with proper HTML formatting (h2, h3, p, ul, li tags). Return JSON: {"result": "<html content>", "alternatives": []}',
  seo: 'You are an SEO expert. Write an optimized meta title (under 60 chars). Return JSON: {"result": "SEO title", "alternatives": ["Alt 1", "Alt 2"]}',
  tags: 'You are a content tagger. Suggest 5-8 relevant tags as a comma-separated list. Return JSON: {"result": "tag1, tag2, tag3", "alternatives": []}',
  rewrite: 'You are a writing coach. Rewrite the provided text to be clearer, more engaging, and professional. Return JSON: {"result": "Rewritten text", "alternatives": []}',
  expand: 'You are a content writer. Expand the provided text with more detail, examples, and depth. Return JSON: {"result": "Expanded text", "alternatives": []}',
};

const LENGTH_TOKENS: Record<string, number> = { short: 300, medium: 600, long: 1200 };

export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const token = getTokenFromRequest(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const body = await req.json();
    const { type = 'content', prompt = '', context = '', tone = 'professional', length = 'medium' } = body;

    if (!SYSTEM_PROMPTS[type]) {
      return NextResponse.json({ error: 'INVALID_TYPE', message: `Unknown type: ${type}` }, { status: 400 });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      // Return mock response for development
      return NextResponse.json({
        result: `[AI Generated ${type}: ${prompt.substring(0, 50)}...]`,
        alternatives: [`Alternative 1 for ${type}`, `Alternative 2 for ${type}`],
      });
    }

    const userMessage = [
      prompt ? `Topic/Context: ${prompt}` : '',
      context ? `Existing content: ${context.substring(0, 1000)}` : '',
      `Tone: ${tone}`,
      type === 'content' || type === 'expand' ? `Length: ${length}` : '',
    ].filter(Boolean).join('\n\n');

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', // Use versatile for quality generation
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS[type] },
          { role: 'user', content: userMessage || 'Generate content' },
        ],
        max_tokens: LENGTH_TOKENS[length] ?? 600,
        temperature: 0.75,
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      log({ level: 'warn', service: SERVICE, message: `Groq returned ${res.status}`, requestId, errText });
      return NextResponse.json({ error: 'AI_UNAVAILABLE', message: 'AI temporarily unavailable' }, { status: 502 });
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? '{}';

    // Parse JSON response from LLM
    let parsed: { result?: string; alternatives?: string[] };
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { result: raw };
    } catch {
      parsed = { result: raw };
    }

    log({ level: 'info', service: SERVICE, message: `Generated ${type}`, requestId });
    return NextResponse.json({ result: parsed.result ?? '', alternatives: parsed.alternatives ?? [] });
  } catch (err) {
    log({ level: 'error', service: SERVICE, message: 'AI generation failed', requestId, errMsg: String(err) });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
