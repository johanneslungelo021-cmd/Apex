/**
 * Image Generation Adapter
 *
 * Provides AI image generation functionality using z-ai-web-dev-sdk.
 * This adapter wraps the SDK's images.generations.create method.
 *
 * @module lib/skills/image-generation
 */

import ZAI from 'z-ai-web-dev-sdk';

export interface ImageGenerationOptions {
  prompt: string;
  size?: '1024x1024' | '768x1344' | '864x1152' | '1344x768' | '1152x864' | '1440x720' | '720x1440';
}

export interface ImageGenerationResult {
  base64: string | null;
  success: boolean;
  error?: string;
}

/**
 * Generates an image from a text prompt using the z-ai-web-dev-sdk.
 *
 * @example
 * ```ts
 * const result = await generateImage({
 *   prompt: 'A beautiful sunset over Table Mountain',
 *   size: '1024x1024'
 * });
 *
 * if (result.success && result.base64) {
 *   // Use the base64 image data
 *   const dataUrl = `data:image/png;base64,${result.base64}`;
 * }
 * ```
 */
export async function generateImage(
  options: ImageGenerationOptions
): Promise<ImageGenerationResult> {
  try {
    const zai = await ZAI.create();

    const response = await zai.images.generations.create({
      prompt: options.prompt,
      size: options.size ?? '1024x1024',
    });

    const base64 = response.data?.[0]?.base64;

    if (!base64) {
      return {
        base64: null,
        success: false,
        error: 'No image data in response',
      };
    }

    return {
      base64,
      success: true,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      base64: null,
      success: false,
      error: errorMessage,
    };
  }
}
