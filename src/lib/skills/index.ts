/**
 * Skills Adapter Layer
 *
 * This module bridges the skills/ directory into the Next.js application.
 * It wraps the z-ai-web-dev-sdk to provide a unified interface for:
 * - LLM chat completions
 * - Web search
 * - Text-to-speech
 * - Image generation
 * - Vision language model
 *
 * These adapters create the import chain required for next build to include
 * the skills functionality in the server bundle.
 *
 * @module lib/skills
 */

// Re-export all skill adapters
export { createChatCompletion, type ChatMessage } from "./chat";
export { webSearch, type SearchResult } from "./web-search";
export { textToSpeech, type TTSOptions } from "./tts";
export { generateImage, type ImageGenerationOptions } from "./image-generation";
export { analyzeImage, type VLMResult } from "./vlm";

// Skill status for health checks
// NOTE: tts and imageGeneration are stubs — no working backend yet
export const SKILLS_STATUS = {
  chat: true,
  webSearch: true,
  tts: false, // Stub — no working TTS backend yet
  imageGeneration: false, // Stub — no working image gen backend yet
  vlm: true,
} as const;
