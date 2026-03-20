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
 */

export type TreasuryEmotionState = 'ecstatic' | 'bullish' | 'neutral' | 'panicked';

export const EMOTION_MULTIPLIERS: Record<TreasuryEmotionState, number> = {
  ecstatic: 1.20,
  bullish:  1.10,
  neutral:  1.00,
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

export async function classifyEmotionState(
  post: PostContext,
  kimiApiKey: string,
): Promise<ClassificationResult> {
  const engagementContext = [
    post.likes   ? `${post.likes} likes`    : '',
    post.shares  ? `${post.shares} shares`  : '',
    post.comments ? `${post.comments} comments` : '',
  ].filter(Boolean).join(', ');

  const userMessage = [
    `Platform: ${post.platform}`,
    `Post text: "${post.text}"`,
    engagementContext ? `Engagement: ${engagementContext}` : '',
  ].filter(Boolean).join('\n');

  const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kimiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'kimi-k2-0711-preview',
      messages: [
        { role: 'system', content: KIMI_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 100,
      temperature: 0.1,  // Low temperature for consistent classification
      stream: false,
    }),
  });

  if (!res.ok) {
    // Fallback to neutral on API failure — never block a transaction
    return {
      emotion_state: 'neutral',
      fee_multiplier: EMOTION_MULTIPLIERS.neutral,
      confidence: 0,
      model: 'fallback',
    };
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? '{}';

  let parsed: { emotion_state?: string; confidence?: number };
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : {};
  } catch {
    parsed = {};
  }

  const state = (['ecstatic','bullish','neutral','panicked'].includes(parsed.emotion_state ?? ''))
    ? (parsed.emotion_state as TreasuryEmotionState)
    : 'neutral';

  return {
    emotion_state: state,
    fee_multiplier: EMOTION_MULTIPLIERS[state],
    confidence: parsed.confidence ?? 0.8,
    model: 'kimi-k2-0711-preview',
  };
}

/** Apply emotion multiplier to platform_fee_zar. Returns rounded result. */
export function applyEmotionMultiplier(
  baseFeeZar: number,
  emotionState: TreasuryEmotionState,
): number {
  return Math.round(baseFeeZar * EMOTION_MULTIPLIERS[emotionState] * 100) / 100;
}
