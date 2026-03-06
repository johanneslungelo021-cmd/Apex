/**
 * AI Agent API Endpoint
 *
 * Provides a conversational AI interface powered by Groq's Llama model.
 * Includes rate limiting, input validation, and integration with the Scout Agent
 * for live opportunity data in responses.
 *
 * @module app/api/ai-agent
 *
 * @example
 * // GET /api/ai-agent - Returns capability manifest
 * // POST /api/ai-agent - Handles chat queries
 *
 * fetch('/api/ai-agent', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     messages: [{ role: 'user', content: 'Find opportunities in Gauteng' }]
 *   })
 * });
 */

import { NextResponse } from 'next/server';
import { runScoutAgent } from '@/lib/agents/scout-agent';
import { generateRequestId, log, fetchWithTimeout, envTimeoutMs, checkRateLimit } from '@/lib/api-utils';
import { agentQueryCounter } from '@/lib/metrics';

/**
 * Service identifier for log entries from this endpoint.
 */
const SERVICE = 'ai-agent';

/**
 * Groq API timeout in milliseconds, configurable via environment variable.
 * Defaults to 15 seconds if GROQ_TIMEOUT_MS is not set.
 */
const GROQ_TIMEOUT_MS = envTimeoutMs(process.env.GROQ_TIMEOUT_MS, 15_000);

/**
 * Rate limit: maximum requests per window per IP.
 */
const RATE_LIMIT = 20;

/**
 * Rate limit window duration in milliseconds (1 minute).
 */
const RATE_WINDOW_MS = 60_000;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Represents a single chat message accepted from clients.
 * 'system' is intentionally excluded — the server is the sole injector of system prompts.
 */
interface ChatMessage {
  /** Message role: only 'user' or 'assistant' accepted from clients */
  role: 'user' | 'assistant';
  /** Message content text */
  content: string;
}

/**
 * Set of valid message roles accepted from client requests.
 * 'system' is excluded: only the server may inject system messages.
 */
const VALID_ROLES = new Set(['user', 'assistant']);

/**
 * Maximum number of messages allowed in a single request.
 */
const MAX_MESSAGES = 20;

/**
 * Maximum length of a single message content string in characters.
 */
const MAX_CONTENT_LENGTH = 4000;

/**
 * Maximum aggregate byte size of all message content in a single request.
 * Guards against crafted payloads that individually pass per-message limits
 * but inflate the total context sent to Groq. Set conservatively below
 * the theoretical maximum (MAX_MESSAGES × MAX_CONTENT_LENGTH = 80 000 chars)
 * to leave headroom for the server-side system prompt and JSON serialization overhead.
 */
const MAX_TOTAL_PAYLOAD_BYTES = 50_000;

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates an array of chat messages from the request body.
 *
 * Performs comprehensive validation including:
 * - Array type and length checks
 * - Object structure validation for each message
 * - Role enumeration validation
 * - Content type and length validation
 *
 * @param raw - The raw messages value from the request body
 * @returns Array of validated ChatMessage objects on success, or error message string on failure
 *
 * @example
 * const result = validateMessages([
 *   { role: 'user', content: 'Hello' }
 * ]);
 * // Returns [{ role: 'user', content: 'Hello' }]
 *
 * @example
 * const result = validateMessages([]);
 * // Returns 'messages array must not be empty.'
 */
function validateMessages(raw: unknown): ChatMessage[] | string {
  if (!Array.isArray(raw)) return 'messages must be a non-empty array.';
  if (raw.length === 0) return 'messages array must not be empty.';
  if (raw.length > MAX_MESSAGES) return `messages array must not exceed ${MAX_MESSAGES} items.`;

  let totalBytes = 0;

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') return `messages[${i}] must be an object.`;
    const { role, content } = item as Record<string, unknown>;

    if (typeof role !== 'string' || !VALID_ROLES.has(role)) {
      return `messages[${i}].role must be "user" or "assistant".`;
    }
    if (typeof content !== 'string' || !content.trim()) {
      return `messages[${i}].content must be a non-empty string.`;
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return `messages[${i}].content must be under ${MAX_CONTENT_LENGTH} characters.`;
    }

    totalBytes += Buffer.byteLength(content, 'utf8');
  }

  // Aggregate payload guard — runs after per-message checks so we have an accurate byte sum.
  // Prevents payloads that pass individually but exceed safe Groq context limits in aggregate.
  if (totalBytes > MAX_TOTAL_PAYLOAD_BYTES) {
    return `messages total payload must be under ${MAX_TOTAL_PAYLOAD_BYTES} bytes.`;
  }

  return raw as ChatMessage[];
}

// ─── GET — Capability Manifest ────────────────────────────────────────────────

/**
 * Returns a machine-readable capability manifest for the AI Agent endpoint.
 *
 * This GET handler provides a self-describing API manifest that allows
 * external AI agents and crawlers to discover what this endpoint does
 * without making a POST request first. Includes schema.org markup for SEO.
 *
 * @returns JSON response with capability manifest and 1-hour cache header
 *
 * @example
 * // GET /api/ai-agent
 * // Response:
 * {
 *   "name": "Apex Intelligent Engine",
 *   "version": "2.0.0",
 *   "description": "...",
 *   "endpoint": "/api/ai-agent",
 *   "method": "POST",
 *   ...
 * }
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
        maxTotalBytes: MAX_TOTAL_PAYLOAD_BYTES,
        items: {
          role: { type: 'string', enum: ['user', 'assistant'] },
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
 * Processing flow:
 * 1. Rate limit check (20 requests per minute per IP)
 * 2. Validate request body and messages array
 * 3. Run Scout Agent (cached — no Groq call if cache is warm)
 * 4. Call Groq with system prompt + live opportunities + user messages
 * 5. Return reply, opportunities, requestId, durationMs with X-Request-Id header
 *
 * All responses include a unique X-Request-Id header for log correlation.
 * Errors are returned with appropriate HTTP status codes and descriptive messages.
 *
 * @param req - The incoming HTTP request
 * @returns JSON response with AI reply, opportunities, and metadata
 *
 * @example
 * // Success response
 * {
 *   "reply": "Here are 3 opportunities in Gauteng...",
 *   "opportunities": [...],
 *   "requestId": "a1b2c3d4e5f6",
 *   "durationMs": 1234
 * }
 *
 * @example
 * // Error response (rate limited)
 * {
 *   "error": "RATE_LIMITED",
 *   "message": "Too many requests. Please wait before retrying.",
 *   "requestId": "a1b2c3d4e5f6"
 * }
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
      const errText = await response.text().catch(() => '');
      log({
        level: 'warn', service: SERVICE,
        message: `Groq returned HTTP ${response.status}`,
        requestId, durationMs: Date.now() - startMs, groqError: errText,
      });
      agentQueryCounter.add(1, { status: 'error' });
      return NextResponse.json(
        { error: 'UPSTREAM_ERROR', message: 'AI engine temporarily unavailable.', requestId },
        { status: 502, headers: { 'X-Request-Id': requestId } },
      );
    }

    const data = await response.json();
    const reply: string = data?.choices?.[0]?.message?.content?.trim() ?? '';

    if (!reply) {
      log({ level: 'warn', service: SERVICE, message: 'Groq returned empty content', requestId });
      agentQueryCounter.add(1, { status: 'error' });
      return NextResponse.json(
        { error: 'UPSTREAM_ERROR', message: 'AI engine returned an empty response.', requestId },
        { status: 502, headers: { 'X-Request-Id': requestId } },
      );
    }

    agentQueryCounter.add(1, { status: 'success' });

    log({
      level: 'info', service: SERVICE,
      message: 'Agent query completed',
      requestId, durationMs: Date.now() - startMs,
    });

    return NextResponse.json(
      { reply, opportunities, requestId, durationMs: Date.now() - startMs },
      { headers: { 'X-Request-Id': requestId } },
    );

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && err.name === 'AbortError';

    agentQueryCounter.add(1, { status: isTimeout ? 'timeout' : 'error' });

    log({
      level: 'error', service: SERVICE,
      message: isTimeout ? 'Groq call timed out' : 'Agent query failed',
      requestId, error: errMsg, durationMs: Date.now() - startMs,
    });

    return NextResponse.json(
      {
        error: isTimeout ? 'TIMEOUT' : 'INTERNAL_ERROR',
        message: isTimeout ? 'Request timed out. Please try again.' : 'An unexpected error occurred.',
        requestId,
      },
      {
        status: isTimeout ? 504 : 500,
        headers: { 'X-Request-Id': requestId },
      },
    );
  }
}
