/**
 * AI Agent API Endpoint — Phase 2 · Streaming + Tiered Model Routing
 *
 * Provides a conversational AI interface with cost-optimized model routing:
 * - Simple queries → llama-3.1-8b-instant ($0.05/$0.08 per M tokens)
 * - Complex queries → llama-3.3-70b-versatile ($0.59/$0.79 per M tokens)
 * - Research queries → Perplexity Sonar ($1/$1 per M tokens)
 *
 * Features NDJSON streaming, rate limiting, input validation, streaming responses,
 * and integration with the Scout Agent for live opportunity data.
 *
 * @module app/api/ai-agent
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { runScoutAgent } from '@/lib/agents/scout-agent';
import {
  generateRequestId,
  log,
  envTimeoutMs,
  checkRateLimit,
} from '@/lib/api-utils';
import {
  agentQueryCounter,
  inferenceLatencyHistogram,
  costAccumulator,
  rateLimitCounter,
  payloadRejectCounter,
} from '@/lib/metrics';
import { enrichMessages, validateTone } from '@/lib/ai/apexIdentityMiddleware';
import {
  buildScoutContextMessage,
  encodeNdjsonEvent,
  estimateOutputTokensFromText,
  type ServerMessage,
} from '@/lib/ai-agent/contracts';
import { APP_VERSION } from '@/lib/version';

const SERVICE = 'ai-agent';
const GROQ_TIMEOUT_MS = envTimeoutMs(process.env.GROQ_TIMEOUT_MS, 15_000);
const PERPLEXITY_TIMEOUT_MS = envTimeoutMs(process.env.PERPLEXITY_TIMEOUT_MS, 14_000);
const KIMI_TIMEOUT_MS = envTimeoutMs(process.env.KIMI_TIMEOUT_MS, 20_000);
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const MAX_REQUEST_BODY_BYTES = 5 * 1024 * 1024;
const MAX_MESSAGES = 20;
const MAX_CONTENT_LENGTH = 4000;
const MAX_TOTAL_PAYLOAD_BYTES = 50_000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ValidatedMessage {
  role: 'user' | 'assistant';
  content: string;
}

const VALID_ROLES = new Set(['user', 'assistant']);

// ─── Tiered Model Router ──────────────────────────────────────────────────────

type QueryTier = 'simple' | 'complex' | 'research';

interface TierConfig {
  tier: QueryTier;
  provider: 'groq' | 'perplexity' | 'kimi';
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
      provider: 'kimi',
      model: 'kimi-k2-0711-preview',
      maxTokens: 2048,
      temperature: 0.6,
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

// ─── Cost Estimation ──────────────────────────────────────────────────────────

function estimateInputTokensFromMessages(messages: ServerMessage[]): number {
  const combined = messages
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .join('\n');

  return estimateOutputTokensFromText(combined);
}

function estimateCost(
  tier: TierConfig,
  inputTokens: number,
  outputTokens: number
): string {
  const pricing: Record<string, { input: number; output: number }> = {
    'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
    'kimi-k2-0711-preview': { input: 0.15, output: 0.60 },
    sonar: { input: 1.0, output: 1.0 },
  };

  const p = pricing[tier.model] || { input: 0, output: 0 };
  const inputCost = (inputTokens / 1_000_000) * p.input;
  const outputCost = (outputTokens / 1_000_000) * p.output;
  return (inputCost + outputCost).toFixed(6);
}

// ─── SSE Helpers ──────────────────────────────────────────────────────────────

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
    version: APP_VERSION,
    description:
      'Tiered AI assistant with streaming responses, cost-optimized model routing, and live web research for South African digital income opportunities.',
    models: {
      simple: 'llama-3.1-8b-instant (Groq, $0.05/$0.08 per M tokens)',
      complex: 'kimi-k2-0711-preview (Moonshot AI, $0.15/$0.60 per M tokens)',
      research: 'sonar (Perplexity, $1/$1 per M tokens + $0.005/request)',
    },
    streaming: true,
    stream: 'application/x-ndjson — one JSON object per line: { "type": "...", "data": ... }',
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
    rateLimitCounter.add(1, { route: 'ai-agent' });
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
      payloadRejectCounter.add(1, { route: 'ai-agent' });
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

  let tierConfig = classifyQuery(messages);

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
    const opportunitySummary = opportunities
      .map(
        (o) =>
          `${o.title} (${o.category}, R${o.cost}, ${o.province}) — ${o.link}`
      )
      .join('\n');

    // Apex Identity Matrix: enriches messages with multi-layer identity context,
    // adaptive emotional state detection, and language-mirroring instructions.
    // This replaces STATIC_SYSTEM_PROMPT with a dynamically assembled identity prompt.
    const scoutContext = buildScoutContextMessage(opportunitySummary);
    const baseMessages: ServerMessage[] = [
      ...(scoutContext ? [scoutContext] : []),
      ...messages,
    ];

    const upstreamMessages: ServerMessage[] = await enrichMessages(baseMessages, {
      userContext: {
        isFirstInteraction: messages.length === 1,
      },
    });

    const estimatedInputTokens = estimateInputTokensFromMessages(upstreamMessages);

    const apiKey = tierConfig.provider === 'perplexity'
      ? process.env.PERPLEXITY_API_KEY
      : tierConfig.provider === 'kimi'
        ? (process.env.KIMI_API_KEY ?? process.env.MPC_APEX)
        : process.env.GROQ_API_KEY;

    if (!apiKey) {
      // Graceful degradation: Kimi missing → fall back to Groq simple
      if (tierConfig.provider === 'kimi') {
        const groqKey = process.env.GROQ_API_KEY;
        if (groqKey) {
          log({ level: 'warn', service: SERVICE, message: 'KIMI_API_KEY missing — falling back to Groq simple', requestId });
          tierConfig = { tier: 'simple', provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 512, temperature: 0.7 };
        } else {
          log({ level: 'error', service: SERVICE, message: 'No AI keys configured', requestId });
          return NextResponse.json(
            { error: 'SERVICE_UNAVAILABLE', message: 'AI engine not configured.', requestId },
            { status: 503, headers: { 'X-Request-Id': requestId } },
          );
        }
      } else if (tierConfig.provider === 'perplexity') {
        const groqKey = process.env.GROQ_API_KEY;
        if (groqKey) {
          log({ level: 'warn', service: SERVICE, message: 'PERPLEXITY_API_KEY missing — falling back to Groq simple', requestId });
          tierConfig = { tier: 'simple', provider: 'groq', model: 'llama-3.1-8b-instant', maxTokens: 512, temperature: 0.7 };
        } else {
          log({ level: 'error', service: SERVICE, message: 'GROQ_API_KEY not configured', requestId });
          return NextResponse.json(
            { error: 'SERVICE_UNAVAILABLE', message: 'AI engine not configured.', requestId },
            { status: 503, headers: { 'X-Request-Id': requestId } },
          );
        }
      } else {
        log({ level: 'error', service: SERVICE, message: 'GROQ_API_KEY not configured', requestId });
        return NextResponse.json(
          { error: 'SERVICE_UNAVAILABLE', message: 'AI engine not configured.', requestId },
          { status: 503, headers: { 'X-Request-Id': requestId } },
        );
      }
    }

    const apiEndpoint = tierConfig.provider === 'perplexity'
      ? 'https://api.perplexity.ai/chat/completions'
      : tierConfig.provider === 'kimi'
        ? 'https://api.moonshot.cn/v1/chat/completions'
        : 'https://api.groq.com/openai/v1/chat/completions';

    // Create abort controller that responds to BOTH timeout AND client disconnect
    const abortController = new AbortController();
    const timeoutMs = tierConfig.provider === 'perplexity'
      ? PERPLEXITY_TIMEOUT_MS
      : tierConfig.provider === 'kimi'
        ? KIMI_TIMEOUT_MS
        : GROQ_TIMEOUT_MS;
    const timeoutId = setTimeout(() => abortController.abort('timeout'), timeoutMs);

    let response: Response;
    try {
      response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: tierConfig.model,
          messages: upstreamMessages,
          max_tokens: tierConfig.maxTokens,
          temperature: tierConfig.temperature,
          stream: true,
        }),
        signal: abortController.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err instanceof Error && (err.name === 'AbortError' || err.message.includes('timeout'));
      log({
        level: 'warn',
        service: SERVICE,
        requestId,
        message: isTimeout ? 'Upstream timeout' : 'Upstream fetch failed',
        durationMs: Date.now() - startMs,
        tier: tierConfig.tier,
        provider: tierConfig.provider,
      });
      agentQueryCounter.add(1, { status: isTimeout ? 'timeout' : 'error', tier: tierConfig.tier });
      return NextResponse.json(
        { error: 'UPSTREAM_ERROR', message: 'The AI engine took too long. Please try again.', requestId },
        { status: 504, headers: { 'X-Request-Id': requestId } },
      );
    }

    clearTimeout(timeoutId);

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

    // Store reader for cancellation in cancel() callback
    const upstreamReader = response.body.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = '';
        let reply = '';
        // Track actual text length for token estimation
        let outputText = '';

        // Send opportunities as first event using NDJSON format
        controller.enqueue(encodeNdjsonEvent('opportunities', opportunities));

        try {
          while (true) {
            const { done, value } = await upstreamReader.read();
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
                outputText += chunk;
                controller.enqueue(encodeNdjsonEvent('chunk', chunk));
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
              outputText += chunk;
              controller.enqueue(encodeNdjsonEvent('chunk', chunk));
            }
          }

          // Record ALL metrics in success path
          const durationMs = Date.now() - startMs;

          // Estimate tokens from actual text length (~4 chars per token for English)
          const estimatedOutputTokens = estimateOutputTokensFromText(outputText);
          const costEst = estimateCost(
            tierConfig,
            estimatedInputTokens,
            estimatedOutputTokens
          );

          // Record histogram
          inferenceLatencyHistogram.record(durationMs, {
            tier: tierConfig.tier,
            provider: tierConfig.provider,
            model: tierConfig.model,
          });

          // Record cost counter
          const costFloat = parseFloat(costEst);
          if (costFloat > 0) {
            costAccumulator.add(costFloat, {
              tier: tierConfig.tier,
              model: tierConfig.model,
            });
          }

          if (!reply.trim()) {
            log({
              level: 'warn',
              service: SERVICE,
              message: 'Empty content from upstream',
              requestId,
            });

            agentQueryCounter.add(1, { status: 'error', tier: tierConfig.tier });
            controller.enqueue(
              encodeNdjsonEvent('error', 'AI engine returned an empty response.')
            );
          } else {
            agentQueryCounter.add(1, { status: 'success', tier: tierConfig.tier });

            // Apex Identity: validate tone — flag drift in logs
            const toneClean = validateTone(reply);

            log({
              level: 'info',
              service: SERVICE,
              message: 'Agent query completed',
              requestId,
              durationMs,
              tier: tierConfig.tier,
              model: tierConfig.model,
              estimatedInputTokens,
              estimatedOutputTokens,
              estimatedCostUsd: costEst,
              toneClean,
            });
          }

          // Send done event with metadata
          controller.enqueue(
            encodeNdjsonEvent('done', {
              requestId,
              durationMs,
              tier: tierConfig.tier,
              model: tierConfig.model,
              estimatedOutputTokens,
              estimatedCostUsd: costEst,
            })
          );
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const isClientDisconnect = err instanceof Error && err.message.includes('cancel');
          const isTimeout = err instanceof Error && err.name === 'AbortError';

          if (!isClientDisconnect) {
            log({
              level: 'warn',
              service: SERVICE,
              requestId,
              message: 'Stream interrupted',
              durationMs: Date.now() - startMs,
              error: errMsg,
            });
          }

          agentQueryCounter.add(1, {
            status: isClientDisconnect ? 'client_disconnect' : isTimeout ? 'timeout' : 'error',
            tier: tierConfig.tier,
          });

          controller.enqueue(
            encodeNdjsonEvent('error', 'Stream interrupted. Please try again.')
          );
          controller.enqueue(
            encodeNdjsonEvent('done', {
              requestId,
              durationMs: Date.now() - startMs,
              tier: tierConfig.tier,
              model: tierConfig.model,
              error: true,
            })
          );
        } finally {
          controller.close();
          upstreamReader.releaseLock();
        }
      },

      // Abort upstream when client disconnects
      cancel() {
        abortController.abort('client_disconnect');
        upstreamReader.cancel().catch(() => {});
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
