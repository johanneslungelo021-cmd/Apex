/**
 * LLM Chat Completion Adapter
 *
 * Provides a unified interface for AI chat completions using z-ai-web-dev-sdk.
 * This adapter wraps the SDK's chat.completions.create method with proper
 * error handling and typing.
 *
 * @module lib/skills/chat
 */

import ZAI from 'z-ai-web-dev-sdk';

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

/**
 * Creates a chat completion using the z-ai-web-dev-sdk.
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
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  try {
    const zai = await ZAI.create();

    const response = await zai.chat.completions.create({
      messages: options.messages,
      stream: options.stream ?? false,
      thinking: { type: 'disabled' },
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(options.maxTokens !== undefined && { max_tokens: options.maxTokens }),
    });

    const content = response.choices?.[0]?.message?.content;

    if (!content) {
      return {
        content: '',
        success: false,
        error: 'No content in response',
      };
    }

    return {
      content,
      success: true,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      content: '',
      success: false,
      error: errorMessage,
    };
  }
}
