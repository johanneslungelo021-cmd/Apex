/**
 * Vision Language Model (VLM) Adapter
 *
 * Provides image analysis and understanding using z-ai-web-dev-sdk.
 * This adapter wraps the SDK's vision capabilities using createVision.
 *
 * @module lib/skills/vlm
 */

import ZAI, { type VisionMessage } from 'z-ai-web-dev-sdk';

export interface VLMOptions {
  image: string; // base64 encoded image or URL
  prompt?: string;
  isUrl?: boolean;
}

export interface VLMResult {
  description: string;
  success: boolean;
  error?: string;
}

/**
 * Analyzes an image using the Vision Language Model via z-ai-web-dev-sdk.
 *
 * @example
 * ```ts
 * // Using a URL
 * const result = await analyzeImage({
 *   image: 'https://example.com/image.jpg',
 *   prompt: 'What do you see in this image?',
 *   isUrl: true
 * });
 *
 * // Using base64
 * const result = await analyzeImage({
 *   image: base64EncodedImage,
 *   prompt: 'Describe this image'
 * });
 * ```
 */
export async function analyzeImage(options: VLMOptions): Promise<VLMResult> {
  try {
    const zai = await ZAI.create();

    // Prepare the image URL - either direct URL or data URL for base64
    const imageUrl = options.isUrl
      ? options.image
      : `data:image/jpeg;base64,${options.image}`;

    const messages: VisionMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: options.prompt ?? 'Describe this image in detail.' },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }
    ];

    const response = await zai.chat.completions.createVision({
      model: 'glm-4.6v',
      messages,
      thinking: { type: 'disabled' }
    });

    const description = response.choices?.[0]?.message?.content;

    if (!description) {
      return {
        description: '',
        success: false,
        error: 'No description in response',
      };
    }

    return {
      description,
      success: true,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      description: '',
      success: false,
      error: errorMessage,
    };
  }
}
