/**
 * AI Assistant API Endpoint
 *
 * Simple AI assistant chat endpoint using Groq.
 * Provides basic chat functionality with timeout handling.
 *
 * @module app/api/assistant
 */

import { NextResponse } from 'next/server';
import { chatSessionCounter } from '@/lib/metrics';
import { generateRequestId, log, fetchWithTimeout, envTimeoutMs } from '@/lib/api-utils';

/**
 * Service identifier for log entries.
 */
const SERVICE = 'assistant';

/**
 * Groq API timeout in milliseconds.
 */
const GROQ_TIMEOUT_MS = envTimeoutMs(process.env.GROQ_TIMEOUT_MS, 15_000);

/**
 * POST handler for AI assistant chat.
 *
 * Sends user message to Groq API and returns AI response.
 * Records chat session metrics for observability.
 *
 * @param request - The incoming HTTP request with JSON body containing 'message'
 * @returns JSON response with AI reply
 *
 * @example
 * // POST /api/assistant
 * // Body: { "message": "Hello, how are you?" }
 * // Response: { "reply": "I'm doing well, thank you for asking!..." }
 */
export async function POST(request: Request) {
  const requestId = generateRequestId();
  const startMs = Date.now();

  try {
    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required', requestId },
        { status: 400 }
      );
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      log({ level: 'error', service: SERVICE, message: 'GROQ_API_KEY not configured', requestId });
      return NextResponse.json(
        { reply: 'AI service is not configured. Please set GROQ_API_KEY.', requestId },
        { status: 503 }
      );
    }

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
          max_tokens: 500,
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant for the Apex platform, helping South African creators build digital income. Be concise and practical.',
            },
            { role: 'user', content: message },
          ],
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
      return NextResponse.json(
        { reply: 'AI service is temporarily unavailable. Please try again.', requestId },
        { status: 502 }
      );
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || 'No response generated.';

    // Record chat session metric
    chatSessionCounter.add(1);

    log({
      level: 'info',
      service: SERVICE,
      message: 'Chat completed',
      requestId,
      durationMs: Date.now() - startMs,
    });

    return NextResponse.json({ reply, requestId });

  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';

    log({
      level: 'error',
      service: SERVICE,
      message: isTimeout ? 'Chat timed out' : 'Chat failed',
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Date.now() - startMs,
    });

    return NextResponse.json(
      {
        reply: isTimeout ? 'Request timed out. Please try again.' : 'An error occurred. Please try again.',
        requestId,
      },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
