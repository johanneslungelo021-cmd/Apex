/**
 * LLM Chat Completion Adapter
 *
 * Provides chat completions via the Groq API (llama-3.1-8b-instant).
 * Falls back gracefully when GROQ_API_KEY is not configured.
 *
 * The `skills/LLM/` directory contains standalone z-ai-web-dev-sdk scripts
 * for the Claude sandbox environment. This adapter re-implements the same
 * interface using the real production API so the Next.js build succeeds on
 * Vercel without requiring the sandbox SDK.
 *
 * @module lib/skills/chat
 */

import { fetchWithTimeout } from '@/lib/api-utils';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompletionResult {
  content: string;
  success: boolean;
  error?: string;
}

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.1-8b-instant';
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Creates a chat completion using the Groq API.
 *
 * @example
 * ```ts
 * const result = await createChatCompletion({
 *   messages: [
 *     { role: 'system', content: 'You are a helpful assistant.' },
 *     { role: 'user', content: 'Hello!' }
 *   ]
 * });
 * ```
 */
export async function createChatCompletion(
  options: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return {
      content: '',
      success: false,
      error: 'GROQ_API_KEY not configured',
    };
  }

  try {
    const response = await fetchWithTimeout(
      GROQ_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: options.messages,
          max_tokens: options.maxTokens ?? 512,
          temperature: options.temperature ?? 0.7,
          stream: false,
        }),
      },
      DEFAULT_TIMEOUT_MS,
    );

    if (!response.ok) {
      const text = await response.text();
      return {
        content: '',
        success: false,
        error: `Groq API error ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return { content: '', success: false, error: 'No content in response' };
    }

    return { content, success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { content: '', success: false, error: errorMessage };
  }
}
