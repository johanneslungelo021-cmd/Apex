/**
 * Sentiment Analysis — Dual-Tier Emotional State Detection
 *
 * Tier 1: HuggingFace zero-shot classification (server-side, high accuracy)
 * Tier 2: Lexical pattern matching (local, zero-latency, zero-bandwidth fallback)
 *
 * The local fallback is critical for low-connectivity provinces (Northern Cape,
 * rural Eastern Cape). It runs entirely on-server without external API calls
 * and includes South African vernacular markers.
 *
 * Cache: 5-minute TTL per text snippet to avoid redundant API calls
 * within the same conversation session.
 */

export type EmotionalState =
  | "neutral"
  | "frustrated"
  | "excited"
  | "confused"
  | "anxious";

import {
  sentimentCounter,
  sentimentLatencyHistogram,
} from "../observability/pillar4Metrics";

// ─── Cache ────────────────────────────────────────────────────────────────────

const sentimentCache = new Map<
  string,
  { state: EmotionalState; timestamp: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCacheKey(text: string): string {
  return text.slice(0, 120).toLowerCase().replace(/\s+/g, " ").trim();
}

// ─── Tier 2: Local Lexical Heuristic ─────────────────────────────────────────
// Runs synchronously. No external calls. Includes SA vernacular.

const FRUSTRATION_PATTERN =
  /\b(broken|fail|error|stuck|impossible|hate|useless|waste|can't|cannot|doesn't work|eish|haibo|irritating|annoying|ridiculous|pathetic|gives up)\b/i;
const EXCITEMENT_PATTERN =
  /\b(amazing|awesome|love|perfect|incredible|excited|yes|finally|sharp|sho|yebo|nice|lekker|brilliant|fantastic|done it|worked|success)\b/i;
const CONFUSION_PATTERN =
  /\b(confused|don't understand|what does|how do|lost|unclear|huh|what\?|not sure|no idea|help me understand|explain)\b/i;
const ANXIETY_PATTERN =
  /\b(worried|scared|nervous|afraid|risk|lose|safe\?|secure\?|is it safe|dangerous|will i lose|scam|legit)\b/i;

/**
 * Fast, synchronous lexical emotional state detection.
 * Used when HF API is unavailable or for low-bandwidth contexts.
 * Includes South African vernacular markers.
 */
export function analyzeSentimentLocal(text: string): EmotionalState {
  const highEmotion = (text.match(/[!?]{2,}/g) ?? []).length > 0;
  const allCaps = text.length > 10 && text === text.toUpperCase();

  if (FRUSTRATION_PATTERN.test(text) || (allCaps && highEmotion))
    return "frustrated";

  const excitedMatch = EXCITEMENT_PATTERN.test(text);
  if (excitedMatch && (highEmotion || /!/.test(text))) return "excited";

  if (CONFUSION_PATTERN.test(text) || /\?{2,}/.test(text)) return "confused";
  if (ANXIETY_PATTERN.test(text)) return "anxious";

  return "neutral";
}

// ─── Tier 1: HuggingFace Zero-Shot Classification ────────────────────────────

const CANDIDATE_LABELS = [
  "frustrated or angry",
  "excited or happy",
  "confused or uncertain",
  "anxious or worried",
  "neutral or calm",
] as const;

const LABEL_MAP: Record<string, EmotionalState> = {
  "frustrated or angry": "frustrated",
  "excited or happy": "excited",
  "confused or uncertain": "confused",
  "anxious or worried": "anxious",
  "neutral or calm": "neutral",
};

interface HFZeroShotResult {
  labels: string[];
  scores: number[];
}

/**
 * Analyzes emotional state using HuggingFace zero-shot classification.
 * Falls back to local lexical heuristic on API failure.
 *
 * Designed for server-side execution only (requires HF_TOKEN env var).
 */
export async function analyzeSentiment(text: string): Promise<EmotionalState> {
  const key = getCacheKey(text);
  const cached = sentimentCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    sentimentCounter.add(1, {
      tier: "hf",
      emotion: cached.state,
      outcome: "cache_hit",
    });
    return cached.state;
  }

  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) {
    // No token — fall through to local immediately
    return analyzeSentimentLocal(text);
  }

  const hfStart = Date.now();

  try {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/facebook/bart-large-mnli",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hfToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: text.slice(0, 500), // HF inference has input length limits
          parameters: { candidate_labels: CANDIDATE_LABELS },
        }),
        signal: AbortSignal.timeout(4_000), // 4s timeout — must be fast
      },
    );

    if (!response.ok) {
      throw new Error(`HF API ${response.status}`);
    }

    const result = (await response.json()) as HFZeroShotResult;
    const topLabel = result.labels?.[0] ?? "neutral or calm";
    const state: EmotionalState = LABEL_MAP[topLabel] ?? "neutral";

    sentimentCache.set(key, { state, timestamp: Date.now() });
    // Pillar 4: emit HF tier success metrics
    sentimentLatencyHistogram.record(Date.now() - hfStart, { tier: "hf" });
    sentimentCounter.add(1, { tier: "hf", emotion: state, outcome: "success" });
    return state;
  } catch {
    // HF API failed — fall back to local heuristic silently
    const fallbackState = analyzeSentimentLocal(text);
    sentimentCache.set(key, { state: fallbackState, timestamp: Date.now() });
    // Pillar 4: record HF attempt latency and local fallback outcome
    sentimentLatencyHistogram.record(Date.now() - hfStart, { tier: "hf" });
    sentimentCounter.add(1, {
      tier: "local",
      emotion: fallbackState,
      outcome: "fallback",
    });
    return fallbackState;
  }
}

/**
 * Clears expired entries from the sentiment cache.
 * Call periodically to prevent memory growth in long-running deployments.
 */
export function purgeSentimentCache(): number {
  const now = Date.now();
  let purged = 0;
  for (const [key, entry] of sentimentCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      sentimentCache.delete(key);
      purged++;
    }
  }
  return purged;
}
