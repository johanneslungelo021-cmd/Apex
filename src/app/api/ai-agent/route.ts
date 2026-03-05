/**
 * AI Agent API Route
 *
 * The Apex Intelligent Engine - a conversational AI agent for South African
 * digital income opportunities. Provides Answer-First responses grounded in
 * live opportunity data (≤ R2000 cost).
 *
 * Features:
 * - Rate limiting (20 requests per minute per IP)
 * - Structured logging with request correlation
 * - Live opportunity data from Scout Agent (5-minute cache)
 * - Capability manifest for external AI agents
 *
 * @module api/ai-agent
 *
 * @example
 * // GET /api/ai-agent - Returns capability manifest
 * // POST /api/ai-agent - Query the agent
 * // Body: { "messages": [{ "role": "user", "content": "Find opportunities in Gauteng" }] }
 */

import { NextResponse } from 'next/server';
import { runScoutAgent } from '@/lib/agents/scout-agent';
import { generateRequestId, log, fetchWithTimeout, envTimeoutMs, checkRateLimit } from '@/lib/api-utils';
import { agentQueryCounter } from '@/lib/metrics';

const SERVICE = 'ai-agent';
const GROQ_TIMEOUT_MS = envTimeoutMs(process.env.GROQ_TIMEOUT_MS, 15_000);

// Rate limit: 20 requests per minute per IP
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single chat message in the conversation.
 */
interface ChatMessage {
  /** Message role: user, assistant, or system */
  role: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
}

/** Valid message roles for validation */
const VALID_ROLES = new Set(['user', 'assistant', 'system']);

/** Maximum messages in a single request */
const MAX_MESSAGES = 20;

/** Maximum characters per message content */
const MAX_CONTENT_LENGTH = 4000;

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates a messages array from the request body.
 * Returns either the validated array or an error message string.
 *
 * @param raw - The raw messages value from the request
 * @returns Validated ChatMessage array or error string
 */
function validateMessages(raw: unknown): ChatMessage[] | string {
  if (!Array.isArray(raw)) return 'messages must be a non-empty array.';
  if (raw.length === 0) return 'messages array must not be empty.';
  if (raw.length > MAX_MESSAGES) return `messages array must not exceed ${MAX_MESSAGES} items.`;

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') return `messages[${i}] must be an object.`;
    const { role, content } = item as Record<string, unknown>;
    if (typeof role !== 'string' || !VALID_ROLES.has(role)) {
      return `messages[${i}].role must be "user", "assistant", or "system".`;
    }
    if (typeof content !== 'string' || !content.trim()) {
      return `messages[${i}].content must be a non-empty string.`;
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return `messages[${i}].content must be under ${MAX_CONTENT_LENGTH} characters.`;
    }
  }

  return raw as ChatMessage[];
}

// ─── GET — Capability Manifest ────────────────────────────────────────────────

/**
 * Returns a machine-readable capability manifest so external AI agents and
 * crawlers can discover what this endpoint does without making a POST first.
 *
 * @returns JSON response with API capability manifest
 *
 * @example
 * // GET /api/ai-agent
 * // Response: { name: 'Apex Intelligent Engine', version: '2.0.0', ... }
 */
export async function GET(): Promise<Response> {
  const manifest = {
    name: 'Apex Intelligent Engine',
    version: '2.0.0',
    description:
      'Conversational AI agent for South African digital income opportunities. ' +
      'Provides Answer-First responses grounded in live opportunity data (≤ R2000 cost).',
    endpoint: '/api/ai-agent',
    method: 'POST',
    input: {
      messages: {
        type: 'array',
        maxItems: MAX_MESSAGES,
        items: {
          role: { type: 'string', enum: ['user', 'assistant', 'system'] },
          content: { type: 'string', maxLength: MAX_CONTENT_LENGTH },
        },
      },
    },
    output: {
      reply: 'string — Answer-First AI response with structured breakdown',
      opportunities: 'array — Live digital income opportunities (refreshed every 5 min)',
      requestId: 'string — Use for log correlation',
      durationMs: 'number — End-to-end latency',
    },
    rateLimit: { requests: RATE_LIMIT, windowMs: RATE_WINDOW_MS },
    exampleQuery: {
      messages: [
        { role: 'user', content: 'Find me a digital income opportunity in Gauteng under R2000' },
      ],
    },
    schema: {
      '@context': 'https://schema.org',
      '@type': 'WebAPI',
      name: 'Apex Intelligent Engine API',
      description: 'AI agent for South African digital income opportunities',
      url: 'https://apex-coral-zeta.vercel.app/api/ai-agent',
    },
  };

  return NextResponse.json(manifest, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}

// ─── POST — Agent Query ───────────────────────────────────────────────────────

/**
 * Handles a conversational query to the Apex Intelligent Engine.
 *
 * Flow:
 * 1. Rate limit check (20 req/min per IP)
 * 2. Validate request body and messages array
 * 3. Run Scout Agent (cached — no Groq call if cache is warm)
 * 4. Call Groq with system prompt + live opportunities + user messages
 * 5. Return reply, opportunities, requestId, durationMs with X-Request-Id header
 *
 * @param req - The incoming HTTP request
 * @returns JSON response with AI reply and opportunities
 *
 * @example
 * // POST /api/ai-agent
 * // Body: { "messages": [{ "role": "user", "content": "Find opportunities" }] }
 * // Response: { "reply": "...", "opportunities": [...], "requestId": "abc123", "durationMs": 1234 }
 */
export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const startMs = Date.now();

  // ── Rate limiting ──────────────────────────────────────────────────────────
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip, RATE_LIMIT, RATE_WINDOW_MS)) {
    log({ level: 'warn', service: SERVICE, message: 'Rate limit exceeded', requestId, ip });
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Too many requests. Please wait before retrying.', requestId },
      {
        status: 429,
        headers: {
          'X-Request-Id': requestId,
          'Retry-After': String(Math.ceil(RATE_WINDOW_MS / 1000)),
        },
      },
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'Invalid JSON body.', requestId },
      { status: 400, headers: { 'X-Request-Id': requestId } },
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'Request body must be a JSON object.', requestId },
      { status: 400, headers: { 'X-Request-Id': requestId } },
    );
  }

  // ── Validate messages ─────────────────────────────────────────────────────
  const { messages: rawMessages } = body as Record<string, unknown>;
  const validated = validateMessages(rawMessages);
  if (typeof validated === 'string') {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: validated, requestId },
      { status: 400, headers: { 'X-Request-Id': requestId } },
    );
  }
  const messages = validated;

  // ── Guard: GROQ_API_KEY ───────────────────────────────────────────────────
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    log({ level: 'error', service: SERVICE, message: 'GROQ_API_KEY not configured', requestId });
    return NextResponse.json(
      { error: 'SERVICE_UNAVAILABLE', message: 'AI engine not configured.', requestId },
      { status: 503, headers: { 'X-Request-Id': requestId } },
    );
  }

  log({ level: 'info', service: SERVICE, message: 'Agent query received', requestId, messageCount: messages.length });

  try {
    // ── Scout Agent — returns from cache if warm, one Groq call if not ──────
    const opportunities = await runScoutAgent();

    // ── Compact opportunity context to minimise token usage ──────────────────
    // Summarise to title + cost + category + link only — saves ~200 tokens vs full JSON
    const opportunitySummary = opportunities.map(o =>
      `${o.title} (${o.category}, R${o.cost}, ${o.province}) — ${o.link}`
    ).join('\n');

    const systemPrompt: ChatMessage = {
      role: 'system',
      content:
        'You are the Apex Intelligent Engine — a practical, empathetic assistant helping South Africans ' +
        'build sustainable digital income. Always lead with a direct Answer-First paragraph (2–3 sentences). ' +
        'Then provide a structured breakdown with clear headings. Use ZAR pricing and reference local platforms. ' +
        `\n\nLive opportunities (refreshed every 5 minutes):\n${opportunitySummary || 'None available right now.'}`,
    };

    // ── Groq call ─────────────────────────────────────────────────────────────
    const response = await fetchWithTimeout(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 1024,
          temperature: 0.7,
          messages: [systemPrompt, ...messages],
        }),
      },
      GROQ_TIMEOUT_MS,
    );

    if (!response.ok) {
      log({
        level: 'error', service: SERVICE,
        message: `Groq returned HTTP ${response.status}`,
        requestId, durationMs: Date.now() - startMs,
      });
      agentQueryCounter.add(1, { status: 'error' });
      return NextResponse.json(
        { error: 'AI_ERROR', message: 'The AI service returned an error.', requestId },
        { status: 502, headers: { 'X-Request-Id': requestId } },
      );
    }

    const data = await response.json();
    const reply: string = data?.choices?.[0]?.message?.content ?? '';

    agentQueryCounter.add(1, { status: 'success' });

    log({
      level: 'info', service: SERVICE,
      message: 'Agent query completed',
      requestId, durationMs: Date.now() - startMs, replyLength: reply.length,
    });

    return NextResponse.json(
      {
        reply,
        opportunities,
        requestId,
        durationMs: Date.now() - startMs,
      },
      { headers: { 'X-Request-Id': requestId } },
    );

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && err.name === 'AbortError';

    agentQueryCounter.add(1, { status: isTimeout ? 'timeout' : 'error' });

    log({
      level: 'error', service: SERVICE,
      message: isTimeout ? 'Agent query timed out' : 'Agent query failed',
      requestId, error: errMsg, durationMs: Date.now() - startMs,
    });

    return NextResponse.json(
      {
        error: isTimeout ? 'TIMEOUT' : 'INTERNAL_ERROR',
        message: isTimeout ? 'The request timed out. Please try again.' : 'An internal error occurred.',
        requestId,
      },
      { status: isTimeout ? 504 : 500, headers: { 'X-Request-Id': requestId } },
    );
  }
}

/** Force dynamic rendering to ensure fresh data */
export const dynamic = 'force-dynamic';
