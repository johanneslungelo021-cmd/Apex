/**
 * AI Agent API Endpoint — Phase 2 · Streaming + Tiered Model Routing
 *
 * Provides a conversational AI interface with cost-optimized model routing:
 * - Simple queries → llama-3.1-8b-instant ($0.05/$0.08 per M tokens)
 * - Complex queries → llama-3.3-70b-versatile ($0.59/$0.79 per M tokens)
 * - Research queries → Perplexity Sonar ($1/$1 per M tokens)
 *
 * Features SSE streaming, rate limiting, input validation, and integration
 * with the Scout Agent for live opportunity data.
 *
 * @module app/api/ai-agent
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  generateRequestId,
  log,
  envTimeoutMs,
  checkRateLimit,
} from '@/lib/api-utils';
import { runScoutAgent } from '@/lib/agents/scout-agent';
import { agentQueryCounter } from '@/lib/metrics';

const SERVICE = 'ai-agent';
const GROQ_TIMEOUT_MS = envTimeoutMs(process.env.GROQ_TIMEOUT_MS, 15_000);
const PERPLEXITY_TIMEOUT_MS = envTimeoutMs(process.env.PERPLEXITY_TIMEOUT_MS, 14_000);
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const MAX_REQUEST_BODY_BYTES = 5 * 1024 * 1024;
const MAX_MESSAGES = 20;
const MAX_CONTENT_LENGTH = 4_000;
const MAX_TOTAL_PAYLOAD_BYTES = 50_000;

// ══════════════════════════════════════════════════════════════
// 1. PayloadTooLargeError
// ══════════════════════════════════════════════════════════════

class PayloadTooLargeError extends Error {
  constructor(message: string = 'Request body exceeds size limit') {
    super(message);
    this.name = 'PayloadTooLargeError';
  }
}

// ══════════════════════════════════════════════════════════════
// 2. Streamed request body guard
// ══════════════════════════════════════════════════════════════

async function readJsonBodyWithinLimit(req: Request): Promise<unknown> {
  const contentLength = req.headers.get('content-length');
  if (contentLength) {
    const declaredLength = parseInt(contentLength, 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
      throw new PayloadTooLargeError();
    }
    return req.json();
  }

  // Streaming path: chunked transfer encoding (no Content-Length)
  const reader = req.body?.getReader();
  if (!reader) {
    throw new SyntaxError('No request body');
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      throw new PayloadTooLargeError();
    }

    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(merged);
  return JSON.parse(text);
}

// ══════════════════════════════════════════════════════════════
// 3. HMAC IP hashing (PII-safe logging)
// ══════════════════════════════════════════════════════════════

function hashIp(ip: string): string | undefined {
  const ipLogSalt = process.env.IP_LOG_SALT;
  if (!ipLogSalt) return undefined;
  return crypto.createHmac('sha256', ipLogSalt).update(ip).digest('hex').slice(0, 16);
}

// ══════════════════════════════════════════════════════════════
// 4. Message validation
// ══════════════════════════════════════════════════════════════

interface ValidatedMessage {
  role: 'user' | 'assistant';
  content: string;
}

function validateMessages(
  messages: unknown
): { valid: true; messages: ValidatedMessage[] } | { valid: false; error: string } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { valid: false, error: 'messages must be a non-empty array' };
  }
  if (messages.length > MAX_MESSAGES) {
    return { valid: false, error: `Too many messages (max ${MAX_MESSAGES})` };
  }

  let totalPayload = 0;
  const validated: ValidatedMessage[] = [];

  for (const msg of messages) {
    if (typeof msg !== 'object' || msg === null) {
      return { valid: false, error: 'Each message must be an object' };
    }
    const { role, content } = msg as Record<string, unknown>;
    if (role !== 'user' && role !== 'assistant') {
      return { valid: false, error: `Invalid role: ${String(role)}` };
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      return { valid: false, error: 'content must be a non-empty string' };
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return { valid: false, error: `Message content exceeds ${MAX_CONTENT_LENGTH} characters` };
    }
    totalPayload += Buffer.byteLength(content, 'utf8');
    if (totalPayload > MAX_TOTAL_PAYLOAD_BYTES) {
      return { valid: false, error: `Total payload exceeds ${MAX_TOTAL_PAYLOAD_BYTES} bytes` };
    }
    validated.push({ role, content });
  }

  return { valid: true, messages: validated };
}

// ══════════════════════════════════════════════════════════════
// 5. ★ Tiered Model Router (cost optimization)
// ══════════════════════════════════════════════════════════════

type QueryTier = 'simple' | 'complex' | 'research';

interface TierConfig {
  tier: QueryTier;
  provider: 'groq' | 'perplexity';
  model: string;
  maxTokens: number;
  temperature: number;
}

// Research-indicating keywords — route to Perplexity Sonar for live web access
const RESEARCH_KEYWORDS = [
  'research', 'latest', 'recent', 'current', 'news', 'today', '2025', '2026',
  'search for', 'find out', 'look up', 'what happened', 'breaking',
  'stock price', 'exchange rate', 'rand', 'zar', 'load shedding',
  'eskom', 'south africa news',
];

// Complexity-indicating keywords — route to 70B model
const COMPLEX_KEYWORDS = [
  'explain in detail', 'analyze', 'compare', 'write code', 'implement',
  'debug', 'refactor', 'comprehensive', 'step by step', 'pros and cons',
  'architecture', 'business plan', 'financial plan', 'investment',
  'strategy', 'calculate', 'how much would',
];

function classifyQuery(messages: ValidatedMessage[]): TierConfig {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMsg) {
    return {
      tier: 'simple',
      provider: 'groq',
      model: 'llama-3.1-8b-instant',
      maxTokens: 512,
      temperature: 0.7,
    };
  }

  const text = lastUserMsg.content.toLowerCase();
  const wordCount = text.split(/\s+/).length;

  // Check research keywords first — these need live web search
  const isResearch = RESEARCH_KEYWORDS.some((kw) => text.includes(kw));
  if (isResearch) {
    return {
      tier: 'research',
      provider: 'perplexity',
      model: 'sonar',
      maxTokens: 1024,
      temperature: 0.3,
    };
  }

  // Check complexity keywords or long messages
  const isComplex = COMPLEX_KEYWORDS.some((kw) => text.includes(kw)) || wordCount > 80;
  if (isComplex) {
    return {
      tier: 'complex',
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      maxTokens: 1024,
      temperature: 0.7,
    };
  }

  // Default: simple queries → cheapest model
  return {
    tier: 'simple',
    provider: 'groq',
    model: 'llama-3.1-8b-instant',
    maxTokens: 512,
    temperature: 0.7,
  };
}

// ══════════════════════════════════════════════════════════════
// 6. System prompt
// ══════════════════════════════════════════════════════════════

function buildSystemPrompt(opportunitySummary: string): string {
  return `You are the Apex Intelligent Engine — a concise, insightful AI assistant embedded in the Digital Apex platform. You help South Africans discover and act on digital income opportunities.

Guidelines:
- Be direct, analytical, and action-oriented
- When discussing money, use ZAR (South African Rand)
- When a user asks you to "Research" a news topic, provide:
  1. 📰 What happened (3 bullet summary)
  2. 🇿🇦 South African impact analysis
  3. 💰 Actionable opportunities for digital creators
- Keep responses under 300 words unless the user explicitly asks for detail
- Use [1], [2] citation format when referencing sources

Live opportunities (refreshed every 5 minutes):
${opportunitySummary || 'None available right now.'}`;
}

// ══════════════════════════════════════════════════════════════
// 7. SSE Stream Helpers
// ══════════════════════════════════════════════════════════════

function encodeSSE(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function encodeStreamEvent(event: string, data: object): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ══════════════════════════════════════════════════════════════
// 8. Streaming Groq call
// ══════════════════════════════════════════════════════════════

async function streamGroqResponse(
  messages: ValidatedMessage[],
  tierConfig: TierConfig,
  systemPrompt: string,
  requestId: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  startMs: number,
  hashedIp: string | undefined
): Promise<void> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error('GROQ_API_KEY not configured');

  const controllerRef = controller;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), GROQ_TIMEOUT_MS);

  try {
    const groqResponse = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: tierConfig.model,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          max_tokens: tierConfig.maxTokens,
          temperature: tierConfig.temperature,
          stream: true,
        }),
        signal: abortController.signal,
      }
    );

    if (!groqResponse.ok) {
      log({
        level: 'error',
        service: SERVICE,
        requestId,
        message: `Groq returned HTTP ${groqResponse.status}`,
        model: tierConfig.model,
        tier: tierConfig.tier,
      });
      throw new Error(`Groq ${groqResponse.status}`);
    }

    const reader = groqResponse.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let totalOutputTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n');
      buffer = events.pop() || '';

      for (const line of events) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const content = json?.choices?.[0]?.delta?.content;
            if (content) {
              totalOutputTokens++;
              controllerRef.enqueue(encoder.encode(encodeSSE({ type: 'chunk', content })));
            }
          } catch {
            // Malformed SSE chunk — skip silently
          }
        }
      }
    }

    const durationMs = Date.now() - startMs;
    const costEstimate = estimateCost(tierConfig, totalOutputTokens);

    log({
      level: 'info',
      service: SERVICE,
      requestId,
      message: 'Stream complete',
      durationMs,
      tier: tierConfig.tier,
      model: tierConfig.model,
      provider: tierConfig.provider,
      estimatedOutputTokens: totalOutputTokens,
      estimatedCostUsd: costEstimate,
      ...(hashedIp !== undefined ? { hashedIp } : {}),
    });

    agentQueryCounter.add(1, { status: 'success', tier: tierConfig.tier });

    // Send done event
    controllerRef.enqueue(encoder.encode(encodeStreamEvent('done', { durationMs, tier: tierConfig.tier })));
  } finally {
    clearTimeout(timeoutId);
  }
}

// ══════════════════════════════════════════════════════════════
// 9. Streaming Perplexity call (for research tier)
// ══════════════════════════════════════════════════════════════

async function streamPerplexityResponse(
  messages: ValidatedMessage[],
  tierConfig: TierConfig,
  systemPrompt: string,
  requestId: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  startMs: number,
  hashedIp: string | undefined
): Promise<void> {
  const pplxKey = process.env.PERPLEXITY_API_KEY;
  if (!pplxKey) throw new Error('PERPLEXITY_API_KEY not configured');

  const controllerRef = controller;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), PERPLEXITY_TIMEOUT_MS);

  try {
    const pplxResponse = await fetch(
      'https://api.perplexity.ai/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pplxKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: tierConfig.model,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          max_tokens: tierConfig.maxTokens,
          temperature: tierConfig.temperature,
          stream: true,
        }),
        signal: abortController.signal,
      }
    );

    if (!pplxResponse.ok) {
      log({
        level: 'error',
        service: SERVICE,
        requestId,
        message: `Perplexity returned HTTP ${pplxResponse.status}`,
        model: tierConfig.model,
        tier: tierConfig.tier,
      });
      throw new Error(`Perplexity ${pplxResponse.status}`);
    }

    const reader = pplxResponse.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let totalOutputTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n');
      buffer = events.pop() || '';

      for (const line of events) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const content = json?.choices?.[0]?.delta?.content;
            if (content) {
              totalOutputTokens++;
              controllerRef.enqueue(encoder.encode(encodeSSE({ type: 'chunk', content })));
            }
          } catch {
            // Malformed SSE chunk — skip silently
          }
        }
      }
    }

    const durationMs = Date.now() - startMs;
    const costEstimate = estimateCost(tierConfig, totalOutputTokens);

    log({
      level: 'info',
      service: SERVICE,
      requestId,
      message: 'Perplexity stream complete',
      durationMs,
      tier: tierConfig.tier,
      model: tierConfig.model,
      provider: tierConfig.provider,
      estimatedOutputTokens: totalOutputTokens,
      estimatedCostUsd: costEstimate,
      ...(hashedIp !== undefined ? { hashedIp } : {}),
    });

    agentQueryCounter.add(1, { status: 'success', tier: tierConfig.tier });

    controllerRef.enqueue(encoder.encode(encodeStreamEvent('done', { durationMs, tier: tierConfig.tier })));
  } finally {
    clearTimeout(timeoutId);
  }
}

// ══════════════════════════════════════════════════════════════
// 10. Cost estimation for observability
// ══════════════════════════════════════════════════════════════

function estimateCost(tier: TierConfig, outputTokens: number): string {
  const pricing: Record<string, { input: number; output: number }> = {
    'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
    'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
    sonar: { input: 1.0, output: 1.0 },
  };

  const p = pricing[tier.model] || { input: 0, output: 0 };
  const inputCost = (500 / 1_000_000) * p.input;
  const outputCost = (outputTokens / 1_000_000) * p.output;
  return (inputCost + outputCost).toFixed(6);
}

// ══════════════════════════════════════════════════════════════
// 11. GET — Capability Manifest
// ══════════════════════════════════════════════════════════════

export async function GET(): Promise<Response> {
  const manifest = {
    name: 'Apex Intelligent Engine',
    version: '2.1.0',
    description:
      'Streaming conversational AI agent with tiered model routing for South African digital income opportunities.',
    endpoint: '/api/ai-agent',
    method: 'POST',
    streaming: true,
    tiers: {
      simple: { model: 'llama-3.1-8b-instant', costPerMillion: '$0.05/$0.08' },
      complex: { model: 'llama-3.3-70b-versatile', costPerMillion: '$0.59/$0.79' },
      research: { model: 'sonar', costPerMillion: '$1.00/$1.00' },
    },
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
    output: 'SSE stream with events: chunk, done, error',
    rateLimit: { requests: RATE_LIMIT, windowMs: RATE_WINDOW_MS },
    schema: {
      '@context': 'https://schema.org',
      '@type': 'WebAPI',
      name: 'Apex Intelligent Engine API',
      description: 'Streaming AI agent for South African digital income opportunities',
      url: 'https://apex-coral-zeta.vercel.app/api/ai-agent',
    },
  };

  return NextResponse.json(manifest, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}

// ══════════════════════════════════════════════════════════════
// 12. POST — Streaming Agent Query
// ══════════════════════════════════════════════════════════════

export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const startMs = Date.now();

  // Rate limiting
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip, RATE_LIMIT, RATE_WINDOW_MS)) {
    const hashedIp = hashIp(ip);
    log({
      level: 'warn',
      service: SERVICE,
      message: 'Rate limit exceeded',
      requestId,
      ...(hashedIp !== undefined ? { hashedIp } : {}),
    });
    return NextResponse.json(
      { error: 'RATE_LIMITED', message: 'Too many requests. Please wait before retrying.', requestId },
      {
        status: 429,
        headers: {
          'X-Request-Id': requestId,
          'Retry-After': String(Math.ceil(RATE_WINDOW_MS / 1000)),
        },
      }
    );
  }

  // Parse body with chunked protection
  let body: unknown;
  try {
    body = await readJsonBodyWithinLimit(req);
  } catch (err: unknown) {
    if (err instanceof PayloadTooLargeError) {
      return NextResponse.json(
        { error: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 5 MB limit.', requestId },
        { status: 413, headers: { 'X-Request-Id': requestId } }
      );
    }
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'Invalid JSON body.', requestId },
      { status: 400, headers: { 'X-Request-Id': requestId } }
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'Request body must be a JSON object.', requestId },
      { status: 400, headers: { 'X-Request-Id': requestId } }
    );
  }

  // Validate messages
  const { messages: rawMessages } = body as Record<string, unknown>;
  const validationResult = validateMessages(rawMessages);
  if (!validationResult.valid) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: validationResult.error, requestId },
      { status: 400, headers: { 'X-Request-Id': requestId } }
    );
  }
  const messages = validationResult.messages;

  // Classify query tier
  const tierConfig = classifyQuery(messages);
  const hashedIp = hashIp(ip);

  log({
    level: 'info',
    service: SERVICE,
    message: 'Agent query received',
    requestId,
    messageCount: messages.length,
    tier: tierConfig.tier,
    model: tierConfig.model,
    ...(hashedIp !== undefined ? { hashedIp } : {}),
  });

  try {
    // Run Scout Agent for live opportunities
    const opportunities = await runScoutAgent();
    const opportunitySummary = opportunities
      .map((o) => `${o.title} (${o.category}, R${o.cost}, ${o.province}) — ${o.link}`)
      .join('\n');

    const systemPrompt = buildSystemPrompt(opportunitySummary);

    // Create streaming response
    const encoder = new TextEncoder();
    const opportunitiesRef = opportunities; // Capture for closure
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // Send opportunities event first (for UI update)
          if (opportunitiesRef.length > 0) {
            controller.enqueue(encoder.encode(encodeStreamEvent('opportunities', {
              opportunities: opportunitiesRef.map(o => ({
                title: o.title,
                province: o.province,
                cost: o.cost,
                incomePotential: o.incomePotential,
                link: o.link,
                category: o.category,
              })),
            })));
          }

          if (tierConfig.provider === 'groq') {
            await streamGroqResponse(
              messages,
              tierConfig,
              systemPrompt,
              requestId,
              controller,
              encoder,
              startMs,
              hashedIp
            );
          } else {
            await streamPerplexityResponse(
              messages,
              tierConfig,
              systemPrompt,
              requestId,
              controller,
              encoder,
              startMs,
              hashedIp
            );
          }
          controller.close();
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const isTimeout = err instanceof Error && err.name === 'AbortError';

          agentQueryCounter.add(1, { status: isTimeout ? 'timeout' : 'error', tier: tierConfig.tier });

          log({
            level: 'error',
            service: SERVICE,
            message: isTimeout ? 'Stream timed out' : 'Stream failed',
            requestId,
            error: errMsg,
            tier: tierConfig.tier,
            durationMs: Date.now() - startMs,
          });

          controller.enqueue(encoder.encode(encodeStreamEvent('error', {
            message: isTimeout ? 'Request timed out. Please try again.' : 'An error occurred.',
          })));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Request-Id': requestId,
        'X-Tier': tierConfig.tier,
        'X-Model': tierConfig.model,
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log({
      level: 'error',
      service: SERVICE,
      message: 'Agent initialization failed',
      requestId,
      error: errMsg,
      durationMs: Date.now() - startMs,
    });

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to initialize agent.', requestId },
      { status: 500, headers: { 'X-Request-Id': requestId } }
    );
  }
}
