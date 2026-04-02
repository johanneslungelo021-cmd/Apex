/**
 * Kimi K2.5 Emotion Classifier for Treasury Fee Multipliers
 *
 * Classifies social media post content into treasury emotion states
 * and returns the fee multiplier to apply to platform_fee_zar.
 *
 * States and multipliers (per Vaal/Gauteng Treasury Model spec):
 *   ecstatic  → 1.20×  (euphoric, celebratory content)
 *   bullish   → 1.10×  (confident, growth-oriented)
 *   neutral   → 1.00×  (informational, balanced)
 *   panicked  → 0.85×  (anxious, crisis, negative)
 *
 * Cache: results persisted to emotion_classification_cache (24h TTL)
 * to reduce Kimi API calls by ~80% on repeated post content.
 */

import crypto from "crypto";
import { getSupabaseClient } from "@/lib/supabase";

export type TreasuryEmotionState =
  | "ecstatic"
  | "bullish"
  | "neutral"
  | "panicked";

export const EMOTION_MULTIPLIERS: Record<TreasuryEmotionState, number> = {
  ecstatic: 1.2,
  bullish: 1.1,
  neutral: 1.0,
  panicked: 0.85,
};

interface PostContext {
  text: string;
  platform: string;
  likes?: number;
  shares?: number;
  comments?: number;
}

interface ClassificationResult {
  emotion_state: TreasuryEmotionState;
  fee_multiplier: number;
  confidence: number;
  model: string;
  cache_hit?: boolean;
}

const KIMI_SYSTEM_PROMPT = `You are a treasury emotion classifier for the Vaal/Gauteng Digital Treasury.

Classify the social media post into exactly one of these treasury emotion states:
- ecstatic: euphoric, celebratory, major milestone, viral success, record-breaking
- bullish: confident, growth-focused, positive momentum, optimistic about the future
- neutral: informational, educational, balanced, standard update
- panicked: anxious, crisis mode, negative sentiment, loss, failure, distress

Consider both the text content and engagement metrics (high likes+shares reinforce positive states).

Respond with ONLY valid JSON:
{"emotion_state": "<state>", "confidence": <0.0-1.0>, "reasoning": "<brief>"}`;

// ─── Cache helpers ────────────────────────────────────────────────────────────

/** SHA-256 of lowercased, whitespace-normalised text — platform agnostic */
function buildContentHash(text: string): string {
  const normalised = text.toLowerCase().replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update(normalised).digest("hex");
}

async function lookupCache(hash: string): Promise<ClassificationResult | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("emotion_classification_cache")
      .select("emotion_state,fee_multiplier,confidence,kimi_model")
      .eq("content_hash", hash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !data) return null;

    return {
      emotion_state: data.emotion_state as TreasuryEmotionState,
      fee_multiplier: Number(data.fee_multiplier),
      confidence: Number(data.confidence),
      model: data.kimi_model,
      cache_hit: true,
    };
  } catch {
    return null; // never block on cache failure
  }
}

async function writeCache(
  hash: string,
  platform: string,
  result: ClassificationResult,
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    await supabase.rpc("upsert_emotion_cache", {
      p_hash: hash,
      p_platform: platform,
      p_emotion_state: result.emotion_state,
      p_fee_multiplier: result.fee_multiplier,
      p_confidence: result.confidence,
      p_model: result.model,
    });
  } catch {
    // Cache write failure is non-fatal — Kimi result is still valid
  }
}

// ─── Kimi K2.5 classification ─────────────────────────────────────────────────

export async function classifyEmotionState(
  post: PostContext,
  kimiApiKey: string,
): Promise<ClassificationResult> {
  const FALLBACK: ClassificationResult = {
    emotion_state: "neutral",
    fee_multiplier: EMOTION_MULTIPLIERS.neutral,
    confidence: 0,
    model: "fallback",
    cache_hit: false,
  };

  if (!post.text?.trim()) return FALLBACK;

  const contentHash = buildContentHash(post.text);

  // 1. Cache hit — skip Kimi entirely
  const cached = await lookupCache(contentHash);
  if (cached) return cached;

  // 2. Call Kimi K2.5
  const engagementContext = [
    post.likes ? `${post.likes} likes` : "",
    post.shares ? `${post.shares} shares` : "",
    post.comments ? `${post.comments} comments` : "",
  ]
    .filter(Boolean)
    .join(", ");

  const userMessage = [
    `Platform: ${post.platform}`,
    `Post text: "${post.text}"`,
    engagementContext ? `Engagement: ${engagementContext}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let res: Response;
  try {
    res = await fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kimiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "kimi-k2-0711-preview",
        messages: [
          { role: "system", content: KIMI_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        max_tokens: 100,
        temperature: 0.1,
        stream: false,
      }),
    });
  } catch {
    return FALLBACK; // network failure — never block a transaction
  }

  if (!res.ok) return FALLBACK;

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return FALLBACK;
  }

  const raw =
    (data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]
      ?.message?.content ?? "{}";

  let parsed: { emotion_state?: string; confidence?: number } = {};
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : {};
  } catch {
    parsed = {};
  }

  const validStates: TreasuryEmotionState[] = [
    "ecstatic",
    "bullish",
    "neutral",
    "panicked",
  ];
  const state: TreasuryEmotionState = validStates.includes(
    parsed.emotion_state as TreasuryEmotionState,
  )
    ? (parsed.emotion_state as TreasuryEmotionState)
    : "neutral";

  const result: ClassificationResult = {
    emotion_state: state,
    fee_multiplier: EMOTION_MULTIPLIERS[state],
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
    model: "kimi-k2-0711-preview",
    cache_hit: false,
  };

  // 3. Persist to cache (non-blocking)
  void writeCache(contentHash, post.platform, result);

  return result;
}

/** Apply emotion multiplier to platform_fee_zar. Returns rounded result. */
export function applyEmotionMultiplier(
  baseFeeZar: number,
  emotionState: TreasuryEmotionState,
): number {
  return Math.round(baseFeeZar * EMOTION_MULTIPLIERS[emotionState] * 100) / 100;
}
