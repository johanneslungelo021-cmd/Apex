/**
 * Image Generation Adapter
 *
 * Image generation is not available in the current Apex stack (the sandbox
 * `skills/image-generation/` script uses z-ai-web-dev-sdk which is not
 * deployed to Vercel).
 *
 * This adapter provides the same interface with a graceful "unavailable"
 * response so the build succeeds and callers can handle the absence cleanly.
 * When an image generation API (e.g. Replicate, DALL-E, or Stability AI) is
 * added to the stack, this file is the single place to implement it.
 *
 * @module lib/skills/image-generation
 */

export interface ImageGenerationOptions {
  prompt: string;
  size?:
    | '1024x1024'
    | '768x1344'
    | '864x1152'
    | '1344x768'
    | '1152x864'
    | '1440x720'
    | '720x1440';
}

export interface ImageGenerationResult {
  base64: string | null;
  success: boolean;
  error?: string;
}

/**
 * Generates an image from a text prompt.
 *
 * Currently returns an unavailable response because no image generation
 * provider is configured in the Apex environment variables.
 */
export async function generateImage(
  _options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
  return {
    base64: null,
    success: false,
    error: 'Image generation is not configured. Add an image generation API key to enable this skill.',
  };
}
