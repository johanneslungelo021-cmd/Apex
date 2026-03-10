// tests/pillar3-heart.test.ts
import { describe, expect, it } from 'bun:test';

// ─── Identity Matrix ──────────────────────────────────────────────────────────
import {
  buildApexIdentity,
  buildAdaptiveContext,
  CORE_IDENTITY,
  CULTURAL_GROUNDING,
  BEHAVIORAL_CONSTRAINTS,
  DIALOGUE_EXAMPLES,
} from '../src/lib/agents/identityMatrix';

// ─── Code Switch ──────────────────────────────────────────────────────────────
import {
  detectUserLanguageStyle,
  selectVernacularPhrase,
  buildLanguageMirrorInstruction,
  VERNACULAR_MOMENTS,
} from '../src/lib/agents/codeSwitch';

// ─── Empathy Engine ───────────────────────────────────────────────────────────
import {
  humanizeError,
  severityToColorClass,
  type ApexError,
} from '../src/lib/agents/empathyEngine';

// ─── Sentiment Analysis (local tier only — no HF API in tests) ───────────────
import {
  analyzeSentimentLocal,
  purgeSentimentCache,
} from '../src/lib/ai/sentimentAnalysis';

// ─── Identity Middleware ──────────────────────────────────────────────────────
import {
  enrichMessagesSync,
  detectToneViolations,
  validateTone,
  type ServerMessage,
} from '../src/lib/ai/apexIdentityMiddleware';

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 1-4: IDENTITY MATRIX
// ═══════════════════════════════════════════════════════════════════════════════

describe('Identity Matrix — core layers', () => {
  it('CORE_IDENTITY is non-empty and contains key identity markers', () => {
    expect(CORE_IDENTITY).toContain('<identity>');
    expect(CORE_IDENTITY).toContain('</identity>');
    expect(CORE_IDENTITY).toContain('Apex Central');
    expect(CORE_IDENTITY).toContain('Vaal AI Empire');
    expect(CORE_IDENTITY).toContain('Mozangwa');
  });

  it('CULTURAL_GROUNDING contains Africanfuturism and Ubuntu references', () => {
    expect(CULTURAL_GROUNDING).toContain('<cultural_voice>');
    expect(CULTURAL_GROUNDING).toContain('Africanfuturism');
    expect(CULTURAL_GROUNDING).toContain('Ubuntu');
    expect(CULTURAL_GROUNDING).toContain('Sawubona');
    expect(CULTURAL_GROUNDING).toContain('stokveld');
  });

  it('BEHAVIORAL_CONSTRAINTS forbids all banned phrases', () => {
    expect(BEHAVIORAL_CONSTRAINTS).toContain('<behavior>');
    expect(BEHAVIORAL_CONSTRAINTS).toContain('As an AI language model');
    expect(BEHAVIORAL_CONSTRAINTS).toContain('utilize');
    expect(BEHAVIORAL_CONSTRAINTS).toContain('synergy');
    // All replacements documented
    expect(BEHAVIORAL_CONSTRAINTS).toContain('optimize');
  });

  it('DIALOGUE_EXAMPLES contains all 5 required examples', () => {
    expect(DIALOGUE_EXAMPLES).toContain('technical_question');
    expect(DIALOGUE_EXAMPLES).toContain('confused_user');
    expect(DIALOGUE_EXAMPLES).toContain('error_state');
    expect(DIALOGUE_EXAMPLES).toContain('provincial_empathy');
    expect(DIALOGUE_EXAMPLES).toContain('celebration');
  });

  it('DIALOGUE_EXAMPLES demonstrates Apex voice in each example', () => {
    // Technical: XRPL explanation
    expect(DIALOGUE_EXAMPLES).toContain('trust-based consensus');
    // Error state: funds safety first
    expect(DIALOGUE_EXAMPLES).toContain('Your funds are safe');
    // Celebration: SA vernacular
    expect(DIALOGUE_EXAMPLES).toContain('Sharp sharp');
    // Province empathy: acknowledges reality
    expect(DIALOGUE_EXAMPLES).toContain('Eastern Cape');
  });
});

describe('Identity Matrix — buildApexIdentity()', () => {
  it('assembles all four static layers', () => {
    const identity = buildApexIdentity();
    expect(identity).toContain(CORE_IDENTITY.slice(0, 50));
    expect(identity).toContain(CULTURAL_GROUNDING.slice(0, 50));
    expect(identity).toContain(BEHAVIORAL_CONSTRAINTS.slice(0, 50));
    expect(identity).toContain(DIALOGUE_EXAMPLES.slice(0, 50));
  });

  it('injects adaptive context when provided', () => {
    const identity = buildApexIdentity('<adaptive_context>test context</adaptive_context>');
    expect(identity).toContain('test context');
  });

  it('produces non-empty string without adaptive context', () => {
    const identity = buildApexIdentity();
    expect(typeof identity).toBe('string');
    expect(identity.length).toBeGreaterThan(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 5: ADAPTIVE CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Identity Matrix — buildAdaptiveContext()', () => {
  it('returns empty string for empty context', () => {
    expect(buildAdaptiveContext({})).toBe('');
  });

  it('includes first-interaction welcome for new users', () => {
    const ctx = buildAdaptiveContext({ isFirstInteraction: true });
    expect(ctx).toContain('adaptive_context');
    expect(ctx).toContain('FIRST interaction');
    expect(ctx).toContain('150 words');
  });

  it('adds high-unemployment sensitivity for Eastern Cape', () => {
    const ctx = buildAdaptiveContext({
      province: 'EC',
      provinceName: 'Eastern Cape',
      unemploymentRate: 41.2,
    });
    expect(ctx).toContain('Eastern Cape');
    expect(ctx).toContain('41.2%');
    expect(ctx).toContain('sensitive about job-related topics');
  });

  it('does NOT add unemployment note for low-unemployment province', () => {
    const ctx = buildAdaptiveContext({
      province: 'WC',
      provinceName: 'Western Cape',
      unemploymentRate: 22,
    });
    expect(ctx).toContain('Western Cape');
    expect(ctx).not.toContain('sensitive about job-related topics');
  });

  it('adds frustrated emotional guidance', () => {
    const ctx = buildAdaptiveContext({ emotionalState: 'frustrated' });
    expect(ctx).toContain('Lead with acknowledgment');
    expect(ctx).toContain('shorter sentences');
  });

  it('adds confused emotional guidance', () => {
    const ctx = buildAdaptiveContext({ emotionalState: 'confused' });
    expect(ctx).toContain('Reduce complexity');
    expect(ctx).toContain('Use analogies');
  });

  it('adds excited emotional guidance', () => {
    const ctx = buildAdaptiveContext({ emotionalState: 'excited' });
    expect(ctx).toContain('Match their energy');
    expect(ctx).toContain('Celebrate specifics');
  });

  it('adds anxious emotional guidance', () => {
    const ctx = buildAdaptiveContext({ emotionalState: 'anxious' });
    expect(ctx).toContain('safety and reassurance');
  });

  it('adds low-connectivity guidance', () => {
    const ctx = buildAdaptiveContext({ connectivityTier: 'low' });
    expect(ctx).toContain('low-bandwidth');
    expect(ctx).toContain('concise');
  });

  it('adds vocabulary accessibility for matric education level', () => {
    const ctx = buildAdaptiveContext({ educationLevel: 'matric' });
    expect(ctx).toContain('accessible without being patronizing');
  });

  it('combines multiple context signals', () => {
    const ctx = buildAdaptiveContext({
      isFirstInteraction: true,
      provinceName: 'Limpopo',
      province: 'LP',
      unemploymentRate: 44,
      emotionalState: 'anxious',
      connectivityTier: 'low',
    });
    expect(ctx).toContain('FIRST interaction');
    expect(ctx).toContain('Limpopo');
    expect(ctx).toContain('44%');
    expect(ctx).toContain('safety');
    expect(ctx).toContain('low-bandwidth');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CODE SWITCH
// ═══════════════════════════════════════════════════════════════════════════════

describe('Code Switch — detectUserLanguageStyle()', () => {
  it('detects isiZulu markers', () => {
    const result = detectUserLanguageStyle('Sawubona! I need help please');
    expect(result.hasVernacular).toBe(true);
    expect(result.detectedLanguages).toContain('zu-ZA');
  });

  it('detects "eish" as isiZulu frustration marker', () => {
    const result = detectUserLanguageStyle('Eish this transaction keeps failing');
    expect(result.hasVernacular).toBe(true);
    expect(result.detectedLanguages).toContain('zu-ZA');
    expect(result.formality).toBe('casual');
  });

  it('detects Afrikaans markers', () => {
    const result = detectUserLanguageStyle('Baie dankie for your help lekker');
    expect(result.hasVernacular).toBe(true);
    expect(result.detectedLanguages).toContain('af-ZA');
  });

  it('detects SA township slang', () => {
    const result = detectUserLanguageStyle('Howzit bru, how does this work?');
    expect(result.hasVernacular).toBe(true);
    expect(result.detectedLanguages).toContain('slang');
    expect(result.formality).toBe('casual');
  });

  it('returns no vernacular for formal English', () => {
    const result = detectUserLanguageStyle('Kindly provide information regarding the blockchain mechanism.');
    expect(result.hasVernacular).toBe(false);
    expect(result.formality).toBe('formal');
  });

  it('classifies casual English correctly', () => {
    const result = detectUserLanguageStyle('hey yeah gonna try this out lol');
    expect(result.hasVernacular).toBe(false);
    expect(result.formality).toBe('casual');
  });
});

describe('Code Switch — selectVernacularPhrase()', () => {
  it('selects isiZulu greeting for zu-ZA user', () => {
    const phrase = selectVernacularPhrase('greeting_first', ['zu-ZA'], 'casual');
    expect(phrase).toContain('Sawubona');
  });

  it('selects casual acknowledgment when no language detected', () => {
    const phrase = selectVernacularPhrase('acknowledgment', [], 'casual');
    expect(phrase).toContain('Sharp');
  });

  it('falls back to default when no match', () => {
    const phrase = selectVernacularPhrase('greeting_first', [], 'formal');
    expect(phrase).toContain('Welcome');
  });

  it('VERNACULAR_MOMENTS covers all expected moments', () => {
    const moments = Object.keys(VERNACULAR_MOMENTS);
    expect(moments).toContain('greeting_first');
    expect(moments).toContain('acknowledgment');
    expect(moments).toContain('empathy');
    expect(moments).toContain('celebration');
    expect(moments).toContain('encouragement');
    expect(moments).toContain('farewell');
  });
});

describe('Code Switch — buildLanguageMirrorInstruction()', () => {
  it('returns empty string when no vernacular detected', () => {
    const style = { hasVernacular: false, detectedLanguages: [], formality: 'formal' as const };
    expect(buildLanguageMirrorInstruction(style)).toBe('');
  });

  it('builds language_mirror XML block when vernacular detected', () => {
    const style = { hasVernacular: true, detectedLanguages: ['zu-ZA'], formality: 'casual' as const };
    const instruction = buildLanguageMirrorInstruction(style);
    expect(instruction).toContain('<language_mirror>');
    expect(instruction).toContain('zu-ZA');
    expect(instruction).toContain('casual');
    expect(instruction).toContain('</language_mirror>');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EMPATHY ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Empathy Engine — humanizeError()', () => {
  const baseError = (code: string): ApexError => ({
    code,
    severity: 'medium',
    technicalMessage: 'test technical detail',
    userContext: {
      wasTransactionInvolved: true,
      userInputPreserved: true,
      isRetryable: true,
      estimatedRecoveryTime: '30 seconds',
    },
  });

  it('handles tecPATH_DRY with funds-safety first', () => {
    const result = humanizeError(baseError('tecPATH_DRY'));
    expect(result.coreMessage).toContain("funds haven't moved");
    expect(result.wisdomNote).toBeDefined();
    expect(result.wisdomNote!.concept).toBe('Payment Paths');
    expect(result.suggestedActions.length).toBeLessThanOrEqual(3);
    expect(result.emotionContext).toBe('cautionary');
  });

  it('handles tecINSUF_FEE with reserve explanation', () => {
    const result = humanizeError(baseError('tecINSUF_FEE'));
    expect(result.coreMessage).toContain('SAFE');
    expect(result.wisdomNote?.concept).toBe('XRP Reserve');
    expect(result.emotionContext).toBe('cautionary');
  });

  it('handles NETWORK_TIMEOUT correctly', () => {
    const result = humanizeError(baseError('NETWORK_TIMEOUT'));
    expect(result.coreMessage).toContain('Nothing was lost');
    expect(result.wisdomNote?.concept).toBe('Network Resilience');
    expect(result.suggestedActions.some((a) => a.action === 'retry_immediate')).toBe(true);
  });

  it('handles AI_GENERATION_FAILED with encouragement', () => {
    const result = humanizeError(baseError('AI_GENERATION_FAILED'));
    expect(result.coreMessage).toContain("That's on me");
    expect(result.emotionContext).toBe('encouraging');
    expect(result.suggestedActions.some((a) => a.action === 'retry_generation')).toBe(true);
  });

  it('handles RATE_LIMITED with recovery time', () => {
    const result = humanizeError(baseError('RATE_LIMITED'));
    expect(result.coreMessage).toContain('30 seconds');
    expect(result.emotionContext).toBe('encouraging');
  });

  it('handles SCOUT_EMPTY gracefully', () => {
    const result = humanizeError(baseError('SCOUT_EMPTY'));
    expect(result.coreMessage).toContain('empty-handed');
    expect(result.emotionContext).toBe('encouraging');
  });

  it('handles PERPLEXITY_UNAVAILABLE with fallback info', () => {
    const result = humanizeError(baseError('PERPLEXITY_UNAVAILABLE'));
    expect(result.coreMessage).toContain('cached data');
    expect(result.emotionContext).toBe('cautionary');
  });

  it('falls back to DEFAULT for unknown error codes', () => {
    const result = humanizeError(baseError('UNKNOWN_WEIRD_CODE'));
    expect(result.coreMessage).toContain('unexpected');
    expect(result.suggestedActions.length).toBeGreaterThan(0);
    expect(result.technicalDetails).toContain('UNKNOWN_WEIRD_CODE');
  });

  it('never blames the user in any error message', () => {
    const blamePatterns = [
      /you (caused|made|created|triggered)/i,
      /your (mistake|fault|error)/i,
      /invalid (input|request)/i,
    ];
    const codes = ['tecPATH_DRY', 'NETWORK_TIMEOUT', 'AI_GENERATION_FAILED', 'RATE_LIMITED', 'DEFAULT'];
    for (const code of codes) {
      const result = humanizeError(baseError(code));
      for (const pattern of blamePatterns) {
        expect(pattern.test(result.coreMessage)).toBe(false);
      }
    }
  });

  it('every error provides at least one suggested action', () => {
    const codes = ['tecPATH_DRY', 'tecINSUF_FEE', 'NETWORK_TIMEOUT', 'AI_GENERATION_FAILED', 'RATE_LIMITED', 'SCOUT_EMPTY', 'DEFAULT'];
    for (const code of codes) {
      const result = humanizeError(baseError(code));
      expect(result.suggestedActions.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('max 3 suggested actions (Hicks Law)', () => {
    const codes = ['tecPATH_DRY', 'NETWORK_TIMEOUT', 'AI_GENERATION_FAILED'];
    for (const code of codes) {
      const result = humanizeError(baseError(code));
      expect(result.suggestedActions.length).toBeLessThanOrEqual(3);
    }
  });

  it('technical details always contain a timestamp', () => {
    const result = humanizeError(baseError('tecPATH_DRY'));
    expect(result.technicalDetails).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe('Empathy Engine — severityToColorClass()', () => {
  it('returns different classes for each severity level', () => {
    const classes = ['low', 'medium', 'high', 'critical'].map(
      (s) => severityToColorClass(s as ApexError['severity'])
    );
    const unique = new Set(classes);
    expect(unique.size).toBe(4);
  });

  it('critical uses red color class', () => {
    expect(severityToColorClass('critical')).toContain('red');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SENTIMENT ANALYSIS (local tier — no HF API in CI)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Sentiment Analysis — analyzeSentimentLocal()', () => {
  it('detects frustration with English markers', () => {
    expect(analyzeSentimentLocal("This is broken and doesn't work!")).toBe('frustrated');
  });

  it('detects frustration with SA vernacular "eish"', () => {
    expect(analyzeSentimentLocal('Eish this is so frustrating')).toBe('frustrated');
  });

  it('detects frustration from all-caps message', () => {
    expect(analyzeSentimentLocal('THIS IS NOT WORKING AT ALL!!')).toBe('frustrated');
  });

  it('detects excitement with SA vernacular "sharp"', () => {
    expect(analyzeSentimentLocal('Sharp sharp! It finally worked!')).toBe('excited');
  });

  it('detects excitement with "yebo"', () => {
    expect(analyzeSentimentLocal('Yebo! Amazing! Got it done!')).toBe('excited');
  });

  it('detects confusion', () => {
    expect(analyzeSentimentLocal("I don't understand what this means??")).toBe('confused');
  });

  it('detects confusion from multiple question marks', () => {
    expect(analyzeSentimentLocal('How do I do this???')).toBe('confused');
  });

  it('detects anxiety about funds safety', () => {
    expect(analyzeSentimentLocal('Is it safe? Will I lose my money?')).toBe('anxious');
  });

  it('returns neutral for calm messages', () => {
    expect(analyzeSentimentLocal('Please show me the transaction history')).toBe('neutral');
  });

  it('returns neutral for short greetings', () => {
    expect(analyzeSentimentLocal('Hello')).toBe('neutral');
  });
});

describe('Sentiment Analysis — purgeSentimentCache()', () => {
  it('returns a number (purged count)', () => {
    const count = purgeSentimentCache();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// IDENTITY MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Identity Middleware — detectToneViolations()', () => {
  it('detects AI self-reference', () => {
    const violations = detectToneViolations('As an AI language model, I cannot...');
    expect(violations.some((v) => v.label === 'AI self-reference')).toBe(true);
  });

  it('detects emotion denial', () => {
    const violations = detectToneViolations("I don't have feelings about this topic.");
    expect(violations.some((v) => v.label === 'Emotion denial')).toBe(true);
  });

  it('detects corporate jargon', () => {
    const violations = detectToneViolations('We should leverage synergy to utilize resources.');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.label === 'Corporate jargon')).toBe(true);
  });

  it('detects robotic refusal', () => {
    const violations = detectToneViolations('I cannot assist with that request.');
    expect(violations.some((v) => v.label === 'Robotic refusal')).toBe(true);
  });

  it('detects generic openers', () => {
    const violations = detectToneViolations('Sure! Let me help you with that.');
    expect(violations.some((v) => v.label === 'Generic opener')).toBe(true);
  });

  it('returns empty array for clean Apex voice', () => {
    const clean = `The XRP Ledger settles your transaction in 3-5 seconds — ` +
      `not 3-5 days like traditional banking. Your value moves at the speed it deserves.`;
    expect(detectToneViolations(clean)).toHaveLength(0);
  });
});

describe('Identity Middleware — validateTone()', () => {
  it('returns true for clean text', () => {
    expect(validateTone('Eish, I hear you — that transaction path ran dry.')).toBe(true);
  });

  it('returns false for text with violations', () => {
    expect(validateTone('As an AI language model, I cannot help.')).toBe(false);
  });
});

describe('Identity Middleware — enrichMessagesSync()', () => {
  const baseMessages: ServerMessage[] = [
    { role: 'user', content: 'How does XRPL work?' },
  ];

  it('injects a system message when none present', () => {
    const enriched = enrichMessagesSync(baseMessages, { userContext: {} });
    expect(enriched[0].role).toBe('system');
    expect(enriched[0].content).toContain('Apex Central');
  });

  it('preserves original user messages', () => {
    const enriched = enrichMessagesSync(baseMessages, { userContext: {} });
    const userMsgs = enriched.filter((m) => m.role === 'user');
    expect(userMsgs.some((m) => m.content === 'How does XRPL work?')).toBe(true);
  });

  it('prepends to existing system message without losing it', () => {
    const withSystem: ServerMessage[] = [
      { role: 'system', content: 'ORIGINAL SYSTEM' },
      { role: 'user', content: 'test' },
    ];
    const enriched = enrichMessagesSync(withSystem, { userContext: {} });
    const sysMsgs = enriched.filter((m) => m.role === 'system');
    expect(sysMsgs.length).toBe(1);
    expect(sysMsgs[0].content).toContain('Apex Central');
    expect(sysMsgs[0].content).toContain('ORIGINAL SYSTEM');
  });

  it('injects language mirror for isiZulu user', () => {
    const zuluMessages: ServerMessage[] = [
      { role: 'user', content: 'Sawubona! Yebo, I need help with XRPL' },
    ];
    const enriched = enrichMessagesSync(zuluMessages, { userContext: {} });
    const sysContent = enriched.find((m) => m.role === 'system')!.content;
    expect(sysContent).toContain('language_mirror');
    expect(sysContent).toContain('zu-ZA');
  });

  it('detects frustrated tone and adds adaptive context', () => {
    const frustrated: ServerMessage[] = [
      { role: 'user', content: "This is broken and doesn't work at all!!" },
    ];
    const enriched = enrichMessagesSync(frustrated, { userContext: {} });
    const sysContent = enriched.find((m) => m.role === 'system')!.content;
    expect(sysContent).toContain('adaptive_context');
    expect(sysContent).toContain('acknowledgment');
  });

  it('marks first interaction context for single-message conversations', () => {
    const enriched = enrichMessagesSync(baseMessages, {
      userContext: { isFirstInteraction: true },
    });
    const sysContent = enriched.find((m) => m.role === 'system')!.content;
    expect(sysContent).toContain('FIRST interaction');
  });

  it('includes provincial context for Eastern Cape high-unemployment', () => {
    const enriched = enrichMessagesSync(baseMessages, {
      userContext: {
        province: 'EC',
        provinceName: 'Eastern Cape',
        unemploymentRate: 41.2,
      },
    });
    const sysContent = enriched.find((m) => m.role === 'system')!.content;
    expect(sysContent).toContain('Eastern Cape');
    expect(sysContent).toContain('41.2%');
  });

  it('produces longer system prompt than base identity alone', () => {
    const enriched = enrichMessagesSync(baseMessages, {
      userContext: {
        isFirstInteraction: true,
        provinceName: 'Limpopo',
        province: 'LP',
        unemploymentRate: 44,
        emotionalState: 'frustrated',
      },
    });
    const sysContent = enriched.find((m) => m.role === 'system')!.content;
    expect(sysContent.length).toBeGreaterThan(2000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION: FULL EMPATHY LOOP
// ═══════════════════════════════════════════════════════════════════════════════

describe('Integration — full empathy loop', () => {
  it('frustrated isiZulu user gets full enrichment pipeline', () => {
    const messages: ServerMessage[] = [
      { role: 'user', content: 'Eish my transaction keeps failing!! I tried 3 times!!' },
    ];
    const enriched = enrichMessagesSync(messages, {
      userContext: {
        province: 'EC',
        provinceName: 'Eastern Cape',
        unemploymentRate: 41.2,
      },
    });

    const sysContent = enriched.find((m) => m.role === 'system')!.content;

    // Identity matrix present
    expect(sysContent).toContain('Apex Central');
    // Cultural grounding present
    expect(sysContent).toContain('Africanfuturism');
    // Language mirror for zu-ZA
    expect(sysContent).toContain('language_mirror');
    // Frustrated emotional adaptation
    expect(sysContent).toContain('acknowledgment');
    // Provincial context with high unemployment sensitivity
    expect(sysContent).toContain('Eastern Cape');
    // All user messages preserved
    expect(enriched.some((m) => m.content.includes('3 times'))).toBe(true);
  });

  it('error humanization + tone validation produces clean actionable response', () => {
    const error: ApexError = {
      code: 'tecPATH_DRY',
      severity: 'medium',
      technicalMessage: 'Insufficient liquidity on path',
      userContext: {
        wasTransactionInvolved: true,
        userInputPreserved: true,
        isRetryable: true,
        estimatedRecoveryTime: '30 seconds',
      },
    };

    const humanized = humanizeError(error);

    // Core message passes tone validation
    expect(validateTone(humanized.coreMessage)).toBe(true);
    // Never blames user
    expect(humanized.coreMessage).not.toMatch(/your fault|you caused|invalid/i);
    // Confirms safety
    expect(humanized.coreMessage).toContain("funds haven't moved");
    // Provides actionable steps
    expect(humanized.suggestedActions.length).toBeGreaterThan(0);
    // Teaches while fixing
    expect(humanized.wisdomNote).toBeDefined();
  });

  it('excited new user gets appropriate welcome enrichment', () => {
    const messages: ServerMessage[] = [
      { role: 'user', content: 'I just got my first smart contract deployed! Sharp sharp!' },
    ];
    const enriched = enrichMessagesSync(messages, {
      userContext: { isFirstInteraction: true },
    });

    const sysContent = enriched.find((m) => m.role === 'system')!.content;
    // First interaction + excited = celebration + welcome context
    expect(sysContent).toContain('FIRST interaction');
    expect(sysContent).toContain('Match their energy');
  });
});
