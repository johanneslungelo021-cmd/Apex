/**
 * Vision Language Model (VLM) Adapter
 *
 * Provides image analysis via the Groq vision API (llama-3.2-11b-vision-preview).
 * Falls back gracefully when GROQ_API_KEY is not configured.
 *
 * The `skills/VLM/` directory contains a standalone z-ai-web-dev-sdk script
 * for the Claude sandbox. This adapter uses the real Groq vision API so the
 * Next.js build succeeds on Vercel.
 *
 * @module lib/skills/vlm
 */

import { fetchWithTimeout } from "@/lib/api-utils";

export interface VLMOptions {
  image: string; // base64-encoded image data or image URL
  prompt?: string;
  isUrl?: boolean;
}

export interface VLMResult {
  description: string;
  success: boolean;
  error?: string;
}

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const VISION_MODEL = "llama-3.2-11b-vision-preview";
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Analyzes an image using the Groq vision API.
 *
 * @param options.image - base64-encoded image data or an https:// URL
 * @param options.isUrl  - set true when `image` is a URL (default: false)
 * @param options.prompt - custom analysis prompt (default: "Describe this image in detail.")
 *
 * @example
 * ```ts
 * const result = await analyzeImage({ image: 'https://example.com/photo.jpg', isUrl: true });
 * if (result.success) console.log(result.description);
 * ```
 */
export async function analyzeImage(options: VLMOptions): Promise<VLMResult> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return {
      description: "",
      success: false,
      error: "GROQ_API_KEY not configured",
    };
  }

  const imageUrl = options.isUrl
    ? options.image
    : `data:image/jpeg;base64,${options.image}`;

  const prompt = options.prompt ?? "Describe this image in detail.";

  try {
    const response = await fetchWithTimeout(
      GROQ_ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageUrl } },
              ],
            },
          ],
          max_tokens: 1024,
          temperature: 0.3,
          stream: false,
        }),
      },
      DEFAULT_TIMEOUT_MS,
    );

    if (!response.ok) {
      const text = await response.text();
      return {
        description: "",
        success: false,
        error: `Groq Vision API error ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const description = data.choices?.[0]?.message?.content;

    if (!description) {
      return {
        description: "",
        success: false,
        error: "No description in response",
      };
    }

    return { description, success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { description: "", success: false, error: errorMessage };
  }
}
