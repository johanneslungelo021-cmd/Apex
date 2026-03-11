/**
 * Skills API Endpoint
 *
 * Provides a unified interface to access all skill adapters:
 * - chat: AI chat completions
 * - search: Web search
 * - tts: Text-to-speech
 * - image: Image generation
 * - vlm: Vision language model
 *
 * This route creates the import chain that ensures skills are included
 * in the Next.js build output.
 *
 * @module app/api/skills
 */

import { NextResponse } from 'next/server';
import {
  createChatCompletion,
  webSearch,
  textToSpeech,
  generateImage,
  analyzeImage,
  SKILLS_STATUS,
  type ChatMessage,
  type SearchResult,
} from '@/lib/skills';
import { log, generateRequestId } from '@/lib/api-utils';

const SERVICE = 'skills';

// ─── GET — Skills Manifest ───────────────────────────────────────────────────

export async function GET(): Promise<Response> {
  const manifest = {
    name: 'Apex Skills API',
    version: '1.0.0',
    description: 'Unified interface for AI skills: chat, web search, TTS, image generation, and VLM.',
    skills: {
      chat: {
        endpoint: '/api/skills',
        method: 'POST',
        action: 'chat',
        description: 'AI chat completions using z-ai-web-dev-sdk',
        input: { messages: 'ChatMessage[]' },
      },
      search: {
        endpoint: '/api/skills',
        method: 'POST',
        action: 'search',
        description: 'Web search using z-ai-web-dev-sdk',
        input: { query: 'string', numResults: 'number (optional)' },
      },
      tts: {
        endpoint: '/api/skills',
        method: 'POST',
        action: 'tts',
        description: 'Text-to-speech using z-ai-web-dev-sdk',
        input: { text: 'string', voice: 'string (optional)', speed: 'number (optional)' },
      },
      image: {
        endpoint: '/api/skills',
        method: 'POST',
        action: 'image',
        description: 'AI image generation using z-ai-web-dev-sdk',
        input: { prompt: 'string', size: 'string (optional)' },
      },
      vlm: {
        endpoint: '/api/skills',
        method: 'POST',
        action: 'vlm',
        description: 'Vision language model using z-ai-web-dev-sdk',
        input: { image: 'string (base64 or URL)', prompt: 'string (optional)' },
      },
    },
    status: SKILLS_STATUS,
  };

  return NextResponse.json(manifest, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}

// ─── POST — Execute Skill ─────────────────────────────────────────────────────

interface SkillRequest {
  action: 'chat' | 'search' | 'tts' | 'image' | 'vlm';
  [key: string]: unknown;
}

export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  let body: SkillRequest;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_JSON', message: 'Request body must be valid JSON.', requestId },
      { status: 400, headers: { 'X-Request-Id': requestId } }
    );
  }

  const { action } = body;

  if (!action || typeof action !== 'string') {
    return NextResponse.json(
      { error: 'INVALID_ACTION', message: 'Request must include an "action" field.', requestId },
      { status: 400, headers: { 'X-Request-Id': requestId } }
    );
  }

  log({ level: 'info', service: SERVICE, message: `Skill invoked: ${action}`, requestId });

  try {
    switch (action) {
      case 'chat': {
        const messages = body.messages as ChatMessage[];
        if (!Array.isArray(messages)) {
          return NextResponse.json(
            { error: 'INVALID_INPUT', message: 'Chat requires a "messages" array.', requestId },
            { status: 400, headers: { 'X-Request-Id': requestId } }
          );
        }
        const result = await createChatCompletion({ messages });
        return NextResponse.json(
          { ...result, requestId },
          { status: result.success ? 200 : 500, headers: { 'X-Request-Id': requestId } }
        );
      }

      case 'search': {
        const query = body.query as string;
        if (!query || typeof query !== 'string') {
          return NextResponse.json(
            { error: 'INVALID_INPUT', message: 'Search requires a "query" string.', requestId },
            { status: 400, headers: { 'X-Request-Id': requestId } }
          );
        }
        const numResults = typeof body.numResults === 'number' ? body.numResults : 10;
        const result = await webSearch({ query, numResults });
        return NextResponse.json(
          { ...result, requestId },
          { status: result.success ? 200 : 500, headers: { 'X-Request-Id': requestId } }
        );
      }

      case 'tts': {
        const text = body.text as string;
        if (!text || typeof text !== 'string') {
          return NextResponse.json(
            { error: 'INVALID_INPUT', message: 'TTS requires a "text" string.', requestId },
            { status: 400, headers: { 'X-Request-Id': requestId } }
          );
        }
        const result = await textToSpeech({
          text,
          voice: body.voice as 'tongtong' | 'jingjing' | 'xiaoyi' | 'wanwan' | undefined,
          speed: typeof body.speed === 'number' ? body.speed : 1.0,
        });
        if (result.success && result.audioBuffer) {
          // Return audio as binary response
          return new Response(result.audioBuffer, {
            status: 200,
            headers: {
              'Content-Type': 'audio/wav',
              'X-Request-Id': requestId,
            },
          });
        }
        return NextResponse.json(
          { success: false, error: result.error, requestId },
          { status: 500, headers: { 'X-Request-Id': requestId } }
        );
      }

      case 'image': {
        const prompt = body.prompt as string;
        if (!prompt || typeof prompt !== 'string') {
          return NextResponse.json(
            { error: 'INVALID_INPUT', message: 'Image generation requires a "prompt" string.', requestId },
            { status: 400, headers: { 'X-Request-Id': requestId } }
          );
        }
        const result = await generateImage({
          prompt,
          size: body.size as '1024x1024' | '768x1344' | '864x1152' | '1344x768' | '1152x864' | '1440x720' | '720x1440' | undefined,
        });
        return NextResponse.json(
          { ...result, requestId },
          { status: result.success ? 200 : 500, headers: { 'X-Request-Id': requestId } }
        );
      }

      case 'vlm': {
        const image = body.image as string;
        if (!image || typeof image !== 'string') {
          return NextResponse.json(
            { error: 'INVALID_INPUT', message: 'VLM requires an "image" string (base64 or URL).', requestId },
            { status: 400, headers: { 'X-Request-Id': requestId } }
          );
        }
        const result = await analyzeImage({
          image,
          prompt: body.prompt as string | undefined,
          isUrl: body.isUrl === true,
        });
        return NextResponse.json(
          { ...result, requestId },
          { status: result.success ? 200 : 500, headers: { 'X-Request-Id': requestId } }
        );
      }

      default:
        return NextResponse.json(
          { error: 'UNKNOWN_ACTION', message: `Unknown action: ${action}`, requestId },
          { status: 400, headers: { 'X-Request-Id': requestId } }
        );
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log({ level: 'error', service: SERVICE, message: `Skill error: ${errorMessage}`, requestId });
    return NextResponse.json(
      { error: 'SKILL_ERROR', message: errorMessage, requestId },
      { status: 500, headers: { 'X-Request-Id': requestId } }
    );
  }
}
