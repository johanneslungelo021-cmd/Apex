/**
 * Text-to-Speech Adapter
 *
 * Provides TTS functionality using z-ai-web-dev-sdk.
 * This adapter wraps the SDK's audio.tts.create method.
 *
 * @module lib/skills/tts
 */

import ZAI from 'z-ai-web-dev-sdk';

export interface TTSOptions {
  text: string;
  voice?: 'tongtong' | 'jingjing' | 'xiaoyi' | 'wanwan';
  speed?: number;
  format?: 'wav' | 'mp3' | 'pcm';
}

export interface TTSResult {
  audioBuffer: ArrayBuffer | null;
  success: boolean;
  error?: string;
}

/**
 * Converts text to speech using the z-ai-web-dev-sdk.
 *
 * @example
 * ```ts
 * const result = await textToSpeech({
 *   text: 'Hello, world!',
 *   voice: 'tongtong',
 *   speed: 1.0
 * });
 *
 * if (result.success && result.audioBuffer) {
 *   // Use the audio buffer
 * }
 * ```
 */
export async function textToSpeech(options: TTSOptions): Promise<TTSResult> {
  try {
    const zai = await ZAI.create();

    const response = await zai.audio.tts.create({
      input: options.text,
      voice: options.voice ?? 'tongtong',
      speed: options.speed ?? 1.0,
      response_format: options.format ?? 'wav',
      stream: false,
    });

    const arrayBuffer = await response.arrayBuffer();

    return {
      audioBuffer: arrayBuffer,
      success: true,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      audioBuffer: null,
      success: false,
      error: errorMessage,
    };
  }
}
