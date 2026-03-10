/**
 * Apex Identity Middleware
 *
 * Intercepts every AI call and injects the full Identity Matrix,
 * adaptive emotional context, and language-mirroring instructions.
 *
 * This ensures consistent Apex voice whether the backend is Groq,
 * Kimi K2, Perplexity, Ollama, or any future provider.
 *
 * It also post-processes responses to detect tone drift —
 * flagging when models slip into "As an AI language model..." speech.
 *
 * Implementation note: does NOT depend on the Vercel AI SDK's
 * wrapLanguageModel (not installed). Instead it is applied as a
 * pre/post-processing layer inside the existing route handlers
 * via enrichMessages() and validateTone().
 */

import { buildApexIdentity, buildAdaptiveContext, type AdaptiveContextInput } from '../agents/identityMatrix';
import { detectUserLanguageStyle, buildLanguageMirrorInstruction } from '../agents/codeSwitch';
import { analyzeSentiment, analyzeSentimentLocal } from './sentimentAnalysis';
import {
  enrichmentCounter,
  enrichmentLatencyHistogram,
  toneViolationCounter,
  toneValidationCounter,
} from '../observability/pillar4Metrics';

export type ServerMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

// ─── Tone Drift Detection ─────────────────────────────────────────────────────

interface ToneViolation {
  pattern: string;
  label: string;
  match: string;
}

const TONE_VIOLATION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /as an ai language model/i,         label: 'AI self-reference' },
  { pattern: /i don't have (feelings|emotions|opinions)/i, label: 'Emotion denial' },
  { pattern: /\b(synergy|leverage|utilize|facilitate)\b/i, label: 'Corporate jargon' },
  { pattern: /i cannot assist with/i,             label: 'Robotic refusal' },
  { pattern: /^(sure!|certainly!|absolutely!)/i,  label: 'Generic opener' },
  { pattern: /as a helpful assistant/i,           label: 'Assistant self-reference' },
];

/**
 * Scans model output for tone drift markers.
 * Returns array of violations found (empty = clean).
 */
export function detectToneViolations(text: string): ToneViolation[] {
  const violations: ToneViolation[] = [];
  for (const { pattern, label } of TONE_VIOLATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      violations.push({ pattern: pattern.source, label, match: match[0] });
    }
  }
  return violations;
}

// ─── Message Injection ────────────────────────────────────────────────────────

/**
 * Extracts the last user message text from a messages array.
 */
function getLastUserText(messages: ServerMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i].content;
    }
  }
  return null;
}

/**
 * Replaces or prepends the system message in a messages array.
 * Puts longform identity data at the top — Anthropic research shows
 * queries at the end improve response quality by up to 30%.
 */
function injectSystemMessage(messages: ServerMessage[], systemContent: string): ServerMessage[] {
  const hasSystem = messages.some((m) => m.role === 'system');
  if (hasSystem) {
    return messages.map((m) =>
      m.role === 'system'
        ? { ...m, content: systemContent + '\n\n---\n\n' + m.content }
        : m
    );
  }
  return [{ role: 'system', content: systemContent }, ...messages];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface IdentityEnrichmentOptions {
  userContext: AdaptiveContextInput;
  /** Use local sentiment analysis (sync) instead of HF API (async). Default: false */
  useLocalSentiment?: boolean;
}

/**
 * Enriches a messages array with the full Apex Identity Matrix.
 *
 * Async version: calls HF sentiment API (preferred for server routes).
 *
 * Usage in a route handler:
 * ```ts
 * const enriched = await enrichMessages(messages, { userContext: { province: 'GP' } });
 * ```
 */
export async function enrichMessages(
  messages: ServerMessage[],
  options: IdentityEnrichmentOptions
): Promise<ServerMessage[]> {
  const lastUserText = getLastUserText(messages);

  const enrichStart = Date.now();

  // 1. Detect emotional state.
  //    Critical routing: useLocalSentiment flag bypasses the HuggingFace API entirely.
  //    For low-connectivity provinces (Eastern Cape, Northern Cape, rural Limpopo),
  //    a 4-second HF round-trip destroys perceived responsiveness.
  //    The local lexical scan runs in <1ms with zero network cost.
  //    Default (false) = HF API with local fallback on failure.
  const emotionalState = lastUserText
    ? options.useLocalSentiment
      ? analyzeSentimentLocal(lastUserText)          // Instant — zero latency, zero quota
      : await analyzeSentiment(lastUserText)          // HF zero-shot, falls back locally on error
    : 'neutral';

  // 2. Detect code-switching
  const languageStyle = lastUserText
    ? detectUserLanguageStyle(lastUserText)
    : { hasVernacular: false, detectedLanguages: [], formality: 'mixed' as const };

  // 3. Build adaptive context with all signals
  const adaptiveContext = buildAdaptiveContext({
    ...options.userContext,
    emotionalState,
  });

  // 4. Build language mirror instruction if code-switching detected
  const languageMirror = buildLanguageMirrorInstruction(languageStyle);

  // 5. Assemble full identity prompt
  const identityPrompt = buildApexIdentity(adaptiveContext + languageMirror);

  // 6. Inject as system message
  const result = injectSystemMessage(messages, identityPrompt);

  // Pillar 4: emit enrichment metrics
  const enrichMs = Date.now() - enrichStart;
  enrichmentLatencyHistogram.record(enrichMs, { tier: options.useLocalSentiment ? 'sync' : 'async' });
  enrichmentCounter.add(1, { tier: options.useLocalSentiment ? 'sync' : 'async', outcome: 'success' });

  return result;
}

/**
 * Synchronous version — uses local lexical sentiment analysis only.
 * Use this in edge environments or when HF_TOKEN is unavailable.
 */
export function enrichMessagesSync(
  messages: ServerMessage[],
  options: IdentityEnrichmentOptions
): ServerMessage[] {
  const syncStart = Date.now();
  const lastUserText = getLastUserText(messages);

  const emotionalState = lastUserText
    ? analyzeSentimentLocal(lastUserText)
    : 'neutral';

  const languageStyle = lastUserText
    ? detectUserLanguageStyle(lastUserText)
    : { hasVernacular: false, detectedLanguages: [], formality: 'mixed' as const };

  const adaptiveContext = buildAdaptiveContext({
    ...options.userContext,
    emotionalState,
  });

  const languageMirror = buildLanguageMirrorInstruction(languageStyle);
  const identityPrompt = buildApexIdentity(adaptiveContext + languageMirror);
  const syncResult = injectSystemMessage(messages, identityPrompt);

  // Pillar 4: emit enrichment metrics for sync path
  const syncMs = Date.now() - syncStart;
  enrichmentLatencyHistogram.record(syncMs, { tier: 'sync' });
  enrichmentCounter.add(1, { tier: 'sync', outcome: 'success' });

  return syncResult;
}

/**
 * Validates tone after generation. Returns true if clean.
 * Logs violations in development; can be wired to alerting in production.
 */
export function validateTone(responseText: string): boolean {
  const violations = detectToneViolations(responseText);

  // Pillar 4: emit per-violation-type metrics
  for (const violation of violations) {
    toneViolationCounter.add(1, { violation_type: violation.label });
  }
  toneValidationCounter.add(1, { outcome: violations.length === 0 ? 'clean' : 'violated' });

  if (violations.length > 0 && process.env.NODE_ENV === 'development') {
    console.warn(
      `[Apex Identity] Tone violations detected (${violations.length}):`,
      violations.map((v) => `${v.label}: "${v.match}"`).join(', ')
    );
  }
  return violations.length === 0;
}

