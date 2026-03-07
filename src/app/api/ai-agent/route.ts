/**
 * AI Agent API Endpoint
 *
 * Provides a conversational AI interface powered by Groq's Llama model.
 * Includes rate limiting, input validation, streaming responses, and integration
 * with the Scout Agent for live opportunity data in responses.
 *
 * @module app/api/ai-agent
 */

import { NextResponse } from 'next/server';
import { runScoutAgent } from '@/lib/agents/scout-agent';
import { generateRequestId, log, fetchWithTimeout, envTimeoutMs, checkRateLimit } from '@/lib/api-utils';
import { agentQueryCounter } from '@/lib/metrics';
import crypto from 'crypto';

const SERVICE = 'ai-agent';
const GROQ_TIMEOUT_MS = envTimeoutMs(process.env.GROQ_TIMEOUT_MS, 15_000);
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const MAX_REQUEST_BODY_BYTES = 5 * 1024 * 1024;
const MAX_MESSAGES = 20;
const MAX_CONTENT_LENGTH = 4000;
const MAX_TOTAL_PAYLOAD_BYTES = 50_000;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ServerMessage {
  role: 'system';
  content: string;
}

const VALID_ROLES = new Set(['user', 'assistant']);

class PayloadTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayloadTooLargeError';
  }
}

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

  if (totalBytes > MAX_TOTAL_PAYLOAD_BYTES) {
    return `messages total payload must be under ${MAX_TOTAL_PAYLOAD_BYTES} bytes.`;
  }

  return raw as ChatMessage[];
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

export async function GET(): Promise<Response> {
  const manifest = {
    name: 'Apex Intelligent Engine',
    version: '2.1.0',
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
      stream: 'application/x-ndjson — events of type opportunities, chunk, done, error',
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

export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const startMs = Date.now();

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip, RATE_LIMIT, RATE_WINDOW_MS)) {
    const ipLogSalt = process.env.IP_LOG_SALT;
    const hashedIp = ipLogSalt
      ? crypto.createHmac('sha256', ipLogSalt).update(ip).digest('hex').slice(0, 16)
      : undefined;
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
    const opportunities = await runScoutAgent();
    const opportunitySummary = opportunities.map(o =>
      `${o.title} (${o.category}, R${o.cost}, ${o.province}) — ${o.link}`
    ).join('\n');

    const systemPrompt: ServerMessage = {
      role: 'system',
      content:
        'You are the Apex Intelligent Engine — a practical, empathetic assistant helping South Africans ' +
        'build sustainable digital income. Always lead with a direct Answer-First paragraph (2–3 sentences). ' +
        'Then provide a structured breakdown with clear headings. Use ZAR pricing and reference local platforms. ' +
        `\n\nLive opportunities (refreshed every 5 minutes):\n${opportunitySummary || 'None available right now.'}`,
    };

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
          stream: true,
          messages: [systemPrompt, ...messages],
        }),
      },
      GROQ_TIMEOUT_MS,
    );

    if (!response.ok) {
      log({
        level: 'warn',
        service: SERVICE,
        message: `Groq returned HTTP ${response.status}`,
        requestId,
        durationMs: Date.now() - startMs,
      });
      agentQueryCounter.add(1, { status: 'error' });
      return NextResponse.json(
        { error: 'UPSTREAM_ERROR', message: 'AI engine temporarily unavailable.', requestId },
        { status: 502, headers: { 'X-Request-Id': requestId } },
      );
    }

    if (!response.body) {
      log({ level: 'warn', service: SERVICE, message: 'Groq returned no response body', requestId });
      agentQueryCounter.add(1, { status: 'error' });
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
              controller.enqueue(encodeStreamEvent({ type: 'chunk', data: chunk }));
            }
          }

          if (!reply.trim()) {
            log({ level: 'warn', service: SERVICE, message: 'Groq returned empty content', requestId });
            agentQueryCounter.add(1, { status: 'error' });
            controller.enqueue(encodeStreamEvent({ type: 'error', data: 'AI engine returned an empty response.' }));
          } else {
            agentQueryCounter.add(1, { status: 'success' });
            log({
              level: 'info',
              service: SERVICE,
              message: 'Agent query completed',
              requestId,
              durationMs: Date.now() - startMs,
            });
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const isTimeout = err instanceof Error && err.name === 'AbortError';

          agentQueryCounter.add(1, { status: isTimeout ? 'timeout' : 'error' });
          log({
            level: 'error',
            service: SERVICE,
            message: isTimeout ? 'Groq stream timed out' : 'Agent stream failed',
            requestId,
            error: errMsg,
            durationMs: Date.now() - startMs,
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
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && err.name === 'AbortError';

    agentQueryCounter.add(1, { status: isTimeout ? 'timeout' : 'error' });

    log({
      level: 'error',
      service: SERVICE,
      message: isTimeout ? 'Groq call timed out' : 'Agent query failed',
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
