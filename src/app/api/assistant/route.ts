/**
 * AI Assistant API Route
 * 
 * Handles chat completions using Vercel AI Gateway or Groq API as backends.
 * Supports fallback behavior and emits metrics to Grafana.
 * 
 * @module api/assistant
 */

import { NextResponse } from 'next/server';
import { chatSessionCounter } from '../../../lib/metrics';

/** Default timeout for AI API calls (10 seconds) */
const rawAiTimeout = parseInt(process.env.AI_TIMEOUT_MS || '10000', 10);
const AI_TIMEOUT_MS = Number.isFinite(rawAiTimeout) && rawAiTimeout > 0 ? rawAiTimeout : 10000;

/**
 * Fetches a URL with an abort signal for timeout control.
 * 
 * @param url - The URL to fetch
 * @param init - Fetch request init options
 * @param timeoutMs - Timeout in milliseconds (default: AI_TIMEOUT_MS)
 * @returns Promise resolving to the Response object
 * @throws AbortError if the request times out
 */
const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs = AI_TIMEOUT_MS): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Handles POST requests for AI chat completions.
 * 
 * @param req - The incoming HTTP request
 * @returns JSON response with AI reply or error message
 * 
 * @example
 * // Request body
 * { "message": "Hello, how are you?" }
 * 
 * // Success response
 * { "reply": "I'm doing great! How can I help you today?" }
 * 
 * // Error response
 * { "reply": "Message is required.", "error": "VALIDATION_ERROR" }
 */
export async function POST(req: Request): Promise<Response> {
  try {
    // Safely parse JSON — a null or malformed body must return 400, not 500
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { reply: 'Invalid JSON body.', error: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { reply: 'Request body must be a JSON object.', error: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const { message } = body as Record<string, unknown>;

    // Message validation: presence, type, length
    if (typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { reply: 'Message is required.' },
        { status: 400 }
      );
    }

    if (message.length > 2000) {
      return NextResponse.json(
        { reply: 'Message must be under 2000 characters.' },
        { status: 400 }
      );
    }

    // Sanitize: trim whitespace
    const sanitizedMessage = message.trim();

    // Try AI services
    const aiGatewayKey = process.env.AI_GATEWAY_API_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;

    let reply = '';

    // Option 1: Use AI Gateway if available
    if (aiGatewayKey) {
      try {
        const res = await fetchWithTimeout(
          'https://gateway.ai.vercel.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${aiGatewayKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'user', content: sanitizedMessage }],
              temperature: 0.8,
            }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          reply = data.choices[0]?.message?.content || '';
        }
      } catch {
        console.log('[ASSISTANT] AI Gateway not available, trying Groq...');
      }
    }

    // Option 2: Use Groq API if AI Gateway didn't work
    if (!reply && groqApiKey) {
      try {
        const res = await fetchWithTimeout(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${groqApiKey}`,
            },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: [{ role: 'user', content: sanitizedMessage }],
              temperature: 0.8,
              max_tokens: 1024,
            }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          reply = data.choices[0]?.message?.content || '';
        }
      } catch {
        console.log('[ASSISTANT] Groq API not available');
      }
    }

    // Emit chat session metric to Grafana
    chatSessionCounter.add(1);

    if (reply) {
      return NextResponse.json({ reply });
    }

    // Fallback response
    return NextResponse.json({
      reply: "I'm the Apex AI Assistant. I can help you with questions about our platform, digital income strategies, and more. Please configure AI_GATEWAY_API_KEY or GROQ_API_KEY for enhanced responses."
    });

  } catch (error: unknown) {
    const err = error as Error;
    console.error('[ASSISTANT] Error:', err.message);

    return NextResponse.json(
      {
        reply: 'I encountered an error. Please try again.',
        error: 'internal_server_error'
      },
      { status: 500 }
    );
  }
}
