/**
 * Natural Code-Switching Engine for South African Multilingual Context.
 *
 * Key principle: code-switching must feel natural, never forced.
 * A South African doesn't say "Sawubona" in every sentence —
 * they use it at greetings, transitions, and moments of connection.
 *
 * Forced vernacular is patronizing. Natural code-switching is belonging.
 *
 * Supports: isiZulu (zu-ZA), Sesotho (st-ZA), Afrikaans (af-ZA),
 * Township slang / Iscamtho, and SA English code-switching patterns.
 */

export type SALanguageCode = 'zu-ZA' | 'st-ZA' | 'af-ZA' | 'slang' | 'default';
export type Formality = 'formal' | 'casual' | 'mixed';

export interface CodeSwitchContext {
  detectedLanguageHints: string[];
  province: string;
  interactionCount: number;
  formality: Formality;
}

export interface LanguageStyle {
  hasVernacular: boolean;
  detectedLanguages: string[];
  formality: Formality;
}

// ─── Vernacular Moments ───────────────────────────────────────────────────────
// Not a phrasebook — moments of connection used contextually.

export const VERNACULAR_MOMENTS = {
  greeting_first: {
    'zu-ZA': 'Sawubona — I see you.',
    'st-ZA': 'Dumelang — peace be with you.',
    'af-ZA': 'Welkom by Apex Central.',
    default: 'Welcome to Apex Central.',
  },
  acknowledgment: {
    'zu-ZA': 'Yebo, I hear you.',
    casual: 'Sharp, I hear you.',
    default: 'I hear you.',
  },
  empathy: {
    'zu-ZA': "Eish, that's heavy.",
    casual: 'Eish, I get it.',
    default: "I understand — that's not easy.",
  },
  celebration: {
    'zu-ZA': "Sho! That's the move right there.",
    casual: 'Sharp sharp! 🔥',
    default: "That's outstanding work.",
  },
  encouragement: {
    ubuntu: 'Siyaphumelela — we succeed together.',
    casual: "You've got this. And you're not doing it alone.",
    default: "You have the capacity. Let's build.",
  },
  farewell: {
    'zu-ZA': 'Sala kahle — stay well.',
    'st-ZA': 'Robala hantle — rest well.',
    casual: 'Stay sharp. The Empire grows.',
    default: 'Until next time.',
  },
} as const;

// ─── Language Detection ───────────────────────────────────────────────────────

/** Vernacular marker patterns for each SA language / dialect. */
const VERNACULAR_PATTERNS: Record<string, RegExp> = {
  'zu-ZA': /\b(sawubona|yebo|eish|sho|sharp|ngiyabonga|unjani|ninjani|haibo|mara|wena)\b/i,
  'st-ZA': /\b(dumelang|khotso|ke|batla|tseba|ntate|mme|rona|bua)\b/i,
  'af-ZA': /\b(baie|dankie|hoe gaan|lekker|mooi|ouens|braai|boet|jy|ek)\b/i,
  slang:   /\b(howzit|bru|china|izzit|shame|ag|naai|jislaaik|eita|skatta|mlungu)\b/i,
};

const FORMAL_MARKERS = /\b(please|kindly|would you|could you|regarding|furthermore|I am writing|I would like)\b/i;
const CASUAL_MARKERS = /\b(hey|yo|sup|lol|gonna|wanna|nah|yeah|tbh|ngl|fr)\b/i;

/**
 * Detects if the user is naturally code-switching in their messages.
 * If they use vernacular, mirror it. If they're formal English, stay formal.
 * Never impose a language the user hasn't invited.
 */
export function detectUserLanguageStyle(message: string): LanguageStyle {
  const detected: string[] = [];
  let hasVernacular = false;

  for (const [lang, pattern] of Object.entries(VERNACULAR_PATTERNS)) {
    if (pattern.test(message)) {
      detected.push(lang);
      hasVernacular = true;
    }
  }

  const formality: Formality = FORMAL_MARKERS.test(message)
    ? 'formal'
    : CASUAL_MARKERS.test(message) || hasVernacular
      ? 'casual'
      : 'mixed';

  return { hasVernacular, detectedLanguages: detected, formality };
}

/**
 * Selects the most contextually appropriate vernacular moment phrase.
 * Prefers the user's detected language, falls back gracefully to casual, then default.
 */
export function selectVernacularPhrase(
  moment: keyof typeof VERNACULAR_MOMENTS,
  detectedLanguages: string[],
  formality: Formality
): string {
  const options = VERNACULAR_MOMENTS[moment] as Record<string, string>;

  // Try detected languages first (in order detected)
  for (const lang of detectedLanguages) {
    if (lang in options) return options[lang];
  }

  // Try formality-based fallback
  if (formality === 'casual' && 'casual' in options) return options['casual'];

  return options['default'] ?? '';
}

/**
 * Builds the language mirror instruction injected into adaptive context.
 * Only called when code-switching is detected.
 */
export function buildLanguageMirrorInstruction(style: LanguageStyle): string {
  if (!style.hasVernacular) return '';

  const langs = style.detectedLanguages.join(', ');
  return (
    `\n<language_mirror>\n` +
    `The user is naturally code-switching with ${langs}. ` +
    `Mirror their style naturally. Match their formality level: ${style.formality}. ` +
    `Use vernacular at natural connection points — greetings, empathy, celebration — ` +
    `not sprinkled into every sentence.\n` +
    `</language_mirror>`
  );
}
