/**
 * Text-to-Speech Adapter
 *
 * Server-side TTS is not available in the current Apex stack (the sandbox
 * `skills/TTS/` script uses z-ai-web-dev-sdk which is not deployed to
 * Vercel).
 *
 * This adapter provides the same interface with a graceful "unavailable"
 * response so the build succeeds and callers can handle the absence cleanly.
 * When a server-side TTS API (e.g. ElevenLabs or a future Groq Audio API)
 * is added, this file is the single place to implement it.
 *
 * Client-side TTS is already available via the `useMultiSensory` hook which
 * uses the Web Speech API (window.speechSynthesis) with no server round-trip.
 *
 * @module lib/skills/tts
 */

export interface TTSOptions {
  text: string;
  voice?: "tongtong" | "jingjing" | "xiaoyi" | "wanwan";
  speed?: number;
  format?: "wav" | "mp3" | "pcm";
}

export interface TTSResult {
  audioBuffer: ArrayBuffer | null;
  success: boolean;
  error?: string;
}

/**
 * Converts text to speech.
 *
 * Currently returns an unavailable response because no server-side TTS
 * provider is configured. Client-side TTS is handled by the Web Speech API
 * in the browser via `useMultiSensory`.
 */
export async function textToSpeech(_options: TTSOptions): Promise<TTSResult> {
  return {
    audioBuffer: null,
    success: false,
    error:
      "Server-side TTS is not configured. Use the Web Speech API (client-side) via useMultiSensory hook instead.",
  };
}
