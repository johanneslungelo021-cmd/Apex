/**
 * AI Agent API Endpoint — Phase 2 · Streaming + Tiered Model Routing
 *
 * Provides a conversational AI interface with cost-optimized model routing:
 * - Simple queries → llama-3.1-8b-instant ($0.05/$0.08 per M tokens)
 * - Complex queries → llama-3.3-70b-versatile ($0.59/$0.79 per M tokens)
 * - Research queries → Perplexity Sonar ($1/$1 per M tokens)
 *
 * Features SSE streaming, rate limiting, input validation, streaming responses,
 * and integration with the Scout Agent for live opportunity data.
 *
 * @module app/api/ai-agent
 */

import { NextResponse } from 'next/server';
import { runScoutAgent } from '@/lib/agents/scout-agent';
import { generateRequestId, log, fetchWithTimeout, envTimeoutMs, checkRateLimit } from '@/lib/api-utils';
import { agentQueryCounter, inferenceLatencyHistogram, costAccumulator } from '@/lib/metrics';
import crypto from 'crypto';

const SERVICE = 'ai-agent';
const GROQ_TIMEOUT_MS = envTimeoutMs(process.env.GROQ_TIMEOUT_MS, 15_000);
const PERPLEXITY_TIMEOUT_MS = envTimeoutMs(process.env.PERPLEXITY_TIMEOUT_MS, 14_000);
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const MAX_REQUEST_BODY_BYTES = 5 * 1024 * 1024;
const MAX_MESSAGES = 20;
const MAX_CONTENT_LENGTH = 4000;
const MAX_TOTAL_PAYLOAD_BYTES = 50_000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServerMessage {
  role: 'system';
  content: string;
}

interface ValidatedMessage {
  role: 'user' | 'assistant';
  content: string;
}

const VALID_ROLES = new Set(['user', 'assistant']);

// ─── Tiered Model Router ──────────────────────────────────────────────────────

type QueryTier = 'simple' | 'complex' | 'research';

interface TierConfig {
  tier: QueryTier;
  provider: 'groq' | 'perplexity';
  model: string;
  maxTokens: number;
  temperature: number;
}

const RESEARCH_KEYWORDS = [
  'research', 'latest', 'recent', 'current', 'news', 'today', '2025', '2026',
  'search for', 'find out', 'look up', 'what happened', 'breaking',
  'stock price', 'exchange rate', 'rand', 'zar', 'load shedding',
  'eskom', 'south africa news',
];

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

  return {
    tier: 'simple',
    provider: 'groq',
    model: 'llama-3.1-8b-instant',
    maxTokens: 512,
    temperature: 0.7,
  };
}

// ─── Payload Protection ───────────────────────────────────────────────────────

class PayloadTooLargeError extends Error {
  constructor(message: string = 'Request body exceeds size limit') {
    super(message);
    this.name = 'PayloadTooLargeError';
  }
}

async function readJsonBodyWithinLimit(req: Request, maxBytes: number): Promise<unknown> {
  const contentLength = req.headers.get('content-length');
  if (contentLength) {
    const declaredLength = parseInt(contentLength, 10);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new PayloadTooLargeError('Request body exceeds 5 MB limit.');
    }
  }

  const reader = req.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new PayloadTooLargeError('Request body exceeds 5 MB limit.');
    }

    chunks.push(value);
  }

  if (totalBytes === 0) return null;

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder().decode(merged));
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateMessages(raw: unknown): ValidatedMessage[] | string {
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

  if (totalBytes > MAX_TOTAL_PAYLOAD_BYTES) {
    return `messages total payload must be under ${MAX_TOTAL_PAYLOAD_BYTES} bytes.`;
  }

  return raw as ValidatedMessage[];
}

// ─── HMAC IP Hashing ──────────────────────────────────────────────────────────

function hashIp(ip: string): string | undefined {
  const ipLogSalt = process.env.IP_LOG_SALT;
  if (!ipLogSalt) return undefined;
  return crypto.createHmac('sha256', ipLogSalt).update(ip).digest('hex').slice(0, 16);
}

// ─── System Prompt Builder ────────────────────────────────────────────────────

function buildSystemPrompt(opportunitySummary: string): string {
  return `You are the Apex Intelligent Engine — a practical, empathetic assistant helping South Africans build sustainable digital income. Always lead with a direct Answer-First paragraph (2–3 sentences). Then provide a structured breakdown with clear headings. Use ZAR pricing and reference local platforms.

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

// ─── Cost Estimation ──────────────────────────────────────────────────────────

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

// ─── Stream Helpers ───────────────────────────────────────────────────────────

function encodeStreamEvent(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(payload)}\n`);
}

function extractContentChunk(dataLine: string): string {
  try {
    const parsed = JSON.parse(dataLine);
    const deltaContent = parsed?.choices?.[0]?.delta?.content;
    if (typeof deltaContent === 'string') return deltaContent;

    const messageContent = parsed?.choices?.[0]?.message?.content;
    if (typeof messageContent === 'string') return messageContent;
  } catch {
    return '';
  }
  return '';
}

function parseSseBuffer(buffer: string): { events: string[]; rest: string } {
  const events = buffer.split('\n\n');
  return {
    events: events.slice(0, -1),
    rest: events.at(-1) ?? '',
  };
}

// ─── GET Endpoint — API Manifest ──────────────────────────────────────────────

export async function GET(): Promise<Response> {
  const manifest = {
    name: 'Apex Intelligent Engine',
    version: '3.0.0',
    description:
      'Tiered AI assistant with streaming responses, cost-optimized model routing, and live web research for South African digital income opportunities.',
    models: {
      simple: 'llama-3.1-8b-instant (Groq, $0.05/$0.08 per M tokens)',
      complex: 'llama-3.3-70b-versatile (Groq, $0.59/$0.79 per M tokens)',
      research: 'sonar (Perplexity, $1/$1 per M tokens + $0.005/request)',
    },
    streaming: true,
    rateLimit: { requests: RATE_LIMIT, windowMs: RATE_WINDOW_MS },
    inputSchema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          maxItems: MAX_MESSAGES,
          maxTotalBytes: MAX_TOTAL_PAYLOAD_BYTES,
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['user', 'assistant'] },
              content: { type: 'string', maxLength: MAX_CONTENT_LENGTH },
            },
            required: ['role', 'content'],
          },
        },
      },
      required: ['messages'],
    },
    output: {
      stream: 'application/x-ndjson — events of type opportunities, chunk, done, error',
      requestId: 'string — Use for log correlation',
      durationMs: 'number — End-to-end latency',
    },
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

// ─── POST — Streaming Agent Query ─────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const startMs = Date.now();

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  const hashedIp = hashIp(ip);

  if (!checkRateLimit(ip, RATE_LIMIT, RATE_WINDOW_MS)) {
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
      },
    );
  }

  let body: unknown;
  try {
    body = await readJsonBodyWithinLimit(req, MAX_REQUEST_BODY_BYTES);
  } catch (err: unknown) {
    if (err instanceof PayloadTooLargeError) {
      return NextResponse.json(
        { error: 'PAYLOAD_TOO_LARGE', message: err.message, requestId },
        { status: 413, headers: { 'X-Request-Id': requestId } },
      );
    }

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

  const { messages: rawMessages } = body as Record<string, unknown>;
  const validated = validateMessages(rawMessages);
  if (typeof validated === 'string') {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: validated, requestId },
      { status: 400, headers: { 'X-Request-Id': requestId } },
    );
  }
  const messages = validated;

  const tierConfig = classifyQuery(messages);

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
    const opportunities = await runScoutAgent();
    const opportunitySummary = opportunities.map(o =>
      `${o.title} (${o.category}, R${o.cost}, ${o.province}) — ${o.link}`
    ).join('\n');

    const systemPrompt: ServerMessage = {
      role: 'system',
      content: buildSystemPrompt(opportunitySummary),
    };

    const apiKey = tierConfig.provider === 'perplexity'
      ? process.env.PERPLEXITY_API_KEY
      : process.env.GROQ_API_KEY;

    if (!apiKey) {
      log({
        level: 'error',
        service: SERVICE,
        message: `${tierConfig.provider.toUpperCase()}_API_KEY not configured`,
        requestId,
      });
      return NextResponse.json(
        { error: 'SERVICE_UNAVAILABLE', message: 'AI engine not configured.', requestId },
        { status: 503, headers: { 'X-Request-Id': requestId } },
      );
    }

    const apiEndpoint = tierConfig.provider === 'perplexity'
      ? 'https://api.perplexity.ai/chat/completions'
      : 'https://api.groq.com/openai/v1/chat/completions';

    const timeoutMs = tierConfig.provider === 'perplexity' ? PERPLEXITY_TIMEOUT_MS : GROQ_TIMEOUT_MS;

    const response = await fetchWithTimeout(
      apiEndpoint,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: tierConfig.model,
          messages: [systemPrompt, ...messages],
          max_tokens: tierConfig.maxTokens,
          temperature: tierConfig.temperature,
          stream: true,
        }),
      },
      timeoutMs,
    );

    if (!response.ok) {
      log({
        level: 'warn',
        service: SERVICE,
        message: `${tierConfig.provider} returned HTTP ${response.status}`,
        requestId,
        tier: tierConfig.tier,
      });
      agentQueryCounter.add(1, { status: 'error', tier: tierConfig.tier });
      return NextResponse.json(
        { error: 'UPSTREAM_ERROR', message: 'AI engine temporarily unavailable.', requestId },
        { status: 502, headers: { 'X-Request-Id': requestId } },
      );
    }

    if (!response.body) {
      log({ level: 'warn', service: SERVICE, message: 'No response body from upstream', requestId });
      agentQueryCounter.add(1, { status: 'error', tier: tierConfig.tier });
      return NextResponse.json(
        { error: 'UPSTREAM_ERROR', message: 'AI engine returned no stream.', requestId },
        { status: 502, headers: { 'X-Request-Id': requestId } },
      );
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let reply = '';
        let outputTokens = 0;

        controller.enqueue(encodeStreamEvent({ type: 'opportunities', data: opportunities }));

        if (!reader) {
          controller.enqueue(encodeStreamEvent({ type: 'error', data: 'AI engine returned no stream.' }));
          controller.enqueue(encodeStreamEvent({ type: 'done', requestId, durationMs: Date.now() - startMs }));
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;

            buffer += decoder.decode(value, { stream: true });
            const parsed = parseSseBuffer(buffer);
            buffer = parsed.rest;

            for (const eventBlock of parsed.events) {
              for (const line of eventBlock.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;

                const dataLine = trimmed.slice(5).trim();
                if (!dataLine || dataLine === '[DONE]') continue;

                const chunk = extractContentChunk(dataLine);
                if (!chunk) continue;

                reply += chunk;
                outputTokens++;
                controller.enqueue(encodeStreamEvent({ type: 'chunk', data: chunk }));
              }
            }
          }

          buffer += decoder.decode();
          const trailing = parseSseBuffer(`${buffer}\n\n`).events;
          for (const eventBlock of trailing) {
            for (const line of eventBlock.split('\n')) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;

              const dataLine = trimmed.slice(5).trim();
              if (!dataLine || dataLine === '[DONE]') continue;

              const chunk = extractContentChunk(dataLine);
              if (!chunk) continue;

              reply += chunk;
              outputTokens++;
              controller.enqueue(encodeStreamEvent({ type: 'chunk', data: chunk }));
            }
          }

          const durationMs = Date.now() - startMs;
          const costEstimate = estimateCost(tierConfig, outputTokens);

          // Record metrics
          inferenceLatencyHistogram.record(durationMs, {
            tier: tierConfig.tier,
            provider: tierConfig.provider,
            model: tierConfig.model,
          });

          const costFloat = parseFloat(costEstimate);
          if (costFloat > 0) {
            costAccumulator.add(costFloat, {
              tier: tierConfig.tier,
              model: tierConfig.model,
            });
          }

          if (!reply.trim()) {
            log({ level: 'warn', service: SERVICE, message: 'Empty content from upstream', requestId });
            agentQueryCounter.add(1, { status: 'error', tier: tierConfig.tier });
            controller.enqueue(encodeStreamEvent({ type: 'error', data: 'AI engine returned an empty response.' }));
          } else {
            agentQueryCounter.add(1, { status: 'success', tier: tierConfig.tier });
            log({
              level: 'info',
              service: SERVICE,
              message: 'Agent query completed',
              requestId,
              durationMs,
              tier: tierConfig.tier,
              model: tierConfig.model,
              estimatedCostUsd: costEstimate,
            });
          }
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
          });
          controller.enqueue(encodeStreamEvent({
            type: 'error',
            data: isTimeout ? 'Request timed out. Please try again.' : 'An unexpected error occurred.',
          }));
        } finally {
          controller.enqueue(encodeStreamEvent({ type: 'done', requestId, durationMs: Date.now() - startMs }));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Request-Id': requestId,
        'X-Model-Tier': tierConfig.tier,
        'X-Model': tierConfig.model,
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && err.name === 'AbortError';

    agentQueryCounter.add(1, { status: isTimeout ? 'timeout' : 'error', tier: 'unknown' });

    log({
      level: 'error',
      service: SERVICE,
      message: isTimeout ? 'Request timed out' : 'Agent query failed',
      requestId,
      error: errMsg,
      durationMs: Date.now() - startMs,
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
