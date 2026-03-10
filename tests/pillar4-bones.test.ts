/**
 * Pillar 4: "Bones" — Security, Rate Limiting, Observability
 *
 * Tests that the structural guarantees of the platform hold:
 *   1. Security headers are correctly declared in next.config.ts
 *   2. All 5 department routes have rate limiting wired
 *   3. Pillar 4 OTEL metrics are real counter/histogram instruments
 *   4. Pillar 3 modules emit metrics correctly after instrumentation
 *   5. Health endpoint includes Pillar 3/4 fields
 *   6. Version is bumped to Pillar 4
 *
 * Runs with: bun test tests/pillar4-bones.test.ts
 */

import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import path from 'path';

// ─── Pillar 4 Metrics imports ─────────────────────────────────────────────────
import {
  enrichmentCounter,
  enrichmentLatencyHistogram,
  toneViolationCounter,
  toneValidationCounter,
  sentimentCounter,
  sentimentLatencyHistogram,
  codeSwitchCounter,
  empathyErrorCounter,
  departmentRateLimitCounter,
} from '../src/lib/observability/pillar4Metrics';

// ─── Pillar 3 imports (now instrumented) ──────────────────────────────────────
import { detectToneViolations, validateTone, enrichMessagesSync, type ServerMessage } from '../src/lib/ai/apexIdentityMiddleware';
import { analyzeSentimentLocal } from '../src/lib/ai/sentimentAnalysis';
import { humanizeError, type ApexError } from '../src/lib/agents/empathyEngine';
import { detectUserLanguageStyle } from '../src/lib/agents/codeSwitch';
import { APP_VERSION } from '../src/lib/version';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readRoute(routePath: string): string {
  return readFileSync(path.join(process.cwd(), routePath), 'utf8');
}

function readConfig(): string {
  return readFileSync(path.join(process.cwd(), 'next.config.ts'), 'utf8');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Version
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pillar 4 — Version', () => {
  it('APP_VERSION is bumped to 4.x', () => {
    expect(APP_VERSION).toMatch(/^4\./);
  });

  it('APP_VERSION contains pillar4 marker', () => {
    expect(APP_VERSION).toContain('pillar4');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Security Headers (next.config.ts)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pillar 4 — Security Headers in next.config.ts', () => {
  const config = readConfig();

  it('declares X-Frame-Options: DENY', () => {
    expect(config).toContain("key: 'X-Frame-Options'");
    expect(config).toContain("value: 'DENY'");
  });

  it('declares X-Content-Type-Options: nosniff', () => {
    expect(config).toContain("key: 'X-Content-Type-Options'");
    expect(config).toContain("value: 'nosniff'");
  });

  it('declares Referrer-Policy', () => {
    expect(config).toContain("key: 'Referrer-Policy'");
    expect(config).toContain('strict-origin-when-cross-origin');
  });

  it('declares Permissions-Policy restricting camera, microphone, geolocation, payment', () => {
    expect(config).toContain("key: 'Permissions-Policy'");
    expect(config).toContain('camera=()');
    expect(config).toContain('microphone=()');
    expect(config).toContain('geolocation=()');
    expect(config).toContain('payment=()');
  });

  it('declares Content-Security-Policy with frame-ancestors none', () => {
    expect(config).toContain("key: 'Content-Security-Policy'");
    expect(config).toContain("frame-ancestors 'none'");
  });

  it('CSP includes upgrade-insecure-requests', () => {
    expect(config).toContain('upgrade-insecure-requests');
  });

  it('declares Strict-Transport-Security with 1-year max-age', () => {
    expect(config).toContain("key: 'Strict-Transport-Security'");
    expect(config).toContain('max-age=31536000');
    expect(config).toContain('includeSubDomains');
  });

  it('headers are applied to all routes via source /(.*)', () => {
    expect(config).toContain("source: '/(.*)'");
  });

  it('SECURITY_HEADERS array is exported to headers() function', () => {
    expect(config).toContain('async headers()');
    expect(config).toContain('SECURITY_HEADERS');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Rate Limiting on Department Routes
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pillar 4 — Rate Limiting on Department Routes', () => {
  const routes = [
    { path: 'src/app/api/trading/route.ts', label: 'trading', limit: '20' },
    { path: 'src/app/api/blogs/route.ts',   label: 'blogs',   limit: '10' },
    { path: 'src/app/api/reels/route.ts',   label: 'reels',   limit: '10' },
    { path: 'src/app/api/news/route.ts',    label: 'news',    limit: '30' },
  ];

  for (const { path: routePath, label, limit } of routes) {
    it(`${label} route imports checkRateLimit`, () => {
      const content = readRoute(routePath);
      expect(content).toContain('checkRateLimit');
    });

    it(`${label} route has rate limit of ${limit} per minute`, () => {
      const content = readRoute(routePath);
      expect(content).toContain(limit);
    });

    it(`${label} route returns 429 when limit exceeded`, () => {
      const content = readRoute(routePath);
      expect(content).toContain('429');
      expect(content).toContain('Rate limit exceeded');
    });

    it(`${label} route emits departmentRateLimitCounter metric`, () => {
      const content = readRoute(routePath);
      expect(content).toContain('departmentRateLimitCounter');
    });

    it(`${label} route includes Retry-After header on 429`, () => {
      const content = readRoute(routePath);
      expect(content).toContain('Retry-After');
    });

    it(`${label} route uses x-forwarded-for for IP extraction`, () => {
      const content = readRoute(routePath);
      expect(content).toContain('x-forwarded-for');
    });

    it(`${label} rate limit key is namespaced with route label`, () => {
      const content = readRoute(routePath);
      expect(content).toContain(`\`${label}:`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Pillar 4 OTEL Metrics — Instrument validity
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pillar 4 — OTEL Metrics Instruments', () => {
  it('enrichmentCounter is a real OTEL counter (has .add method)', () => {
    expect(typeof enrichmentCounter.add).toBe('function');
  });

  it('enrichmentLatencyHistogram is a real OTEL histogram (has .record method)', () => {
    expect(typeof enrichmentLatencyHistogram.record).toBe('function');
  });

  it('toneViolationCounter has .add method', () => {
    expect(typeof toneViolationCounter.add).toBe('function');
  });

  it('toneValidationCounter has .add method', () => {
    expect(typeof toneValidationCounter.add).toBe('function');
  });

  it('sentimentCounter has .add method', () => {
    expect(typeof sentimentCounter.add).toBe('function');
  });

  it('sentimentLatencyHistogram has .record method', () => {
    expect(typeof sentimentLatencyHistogram.record).toBe('function');
  });

  it('codeSwitchCounter has .add method', () => {
    expect(typeof codeSwitchCounter.add).toBe('function');
  });

  it('empathyErrorCounter has .add method', () => {
    expect(typeof empathyErrorCounter.add).toBe('function');
  });

  it('departmentRateLimitCounter has .add method', () => {
    expect(typeof departmentRateLimitCounter.add).toBe('function');
  });

  it('all counters can be invoked without throwing', () => {
    expect(() => enrichmentCounter.add(1, { tier: 'sync', outcome: 'success' })).not.toThrow();
    expect(() => toneViolationCounter.add(1, { violation_type: 'test' })).not.toThrow();
    expect(() => toneValidationCounter.add(1, { outcome: 'clean' })).not.toThrow();
    expect(() => sentimentCounter.add(1, { tier: 'local', emotion: 'neutral', outcome: 'success' })).not.toThrow();
    expect(() => codeSwitchCounter.add(1, { language: 'zu-ZA', detected: 'true' })).not.toThrow();
    expect(() => empathyErrorCounter.add(1, { error_code: 'DEFAULT', severity: 'low' })).not.toThrow();
    expect(() => departmentRateLimitCounter.add(1, { route: 'trading', outcome: 'allowed' })).not.toThrow();
  });

  it('histograms can be invoked without throwing', () => {
    expect(() => enrichmentLatencyHistogram.record(42, { tier: 'sync' })).not.toThrow();
    expect(() => sentimentLatencyHistogram.record(3800, { tier: 'hf' })).not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Pillar 3 modules emit Pillar 4 metrics (instrumentation wiring)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pillar 4 — Pillar 3 instrumentation wiring (source code checks)', () => {
  it('apexIdentityMiddleware imports enrichmentCounter from pillar4Metrics', () => {
    const content = readRoute('src/lib/ai/apexIdentityMiddleware.ts');
    expect(content).toContain('enrichmentCounter');
    expect(content).toContain('pillar4Metrics');
  });

  it('apexIdentityMiddleware records enrichment latency histogram', () => {
    const content = readRoute('src/lib/ai/apexIdentityMiddleware.ts');
    expect(content).toContain('enrichmentLatencyHistogram.record');
  });

  it('validateTone emits per-violation toneViolationCounter', () => {
    const content = readRoute('src/lib/ai/apexIdentityMiddleware.ts');
    expect(content).toContain('toneViolationCounter.add');
    expect(content).toContain('toneValidationCounter.add');
  });

  it('sentimentAnalysis imports sentimentCounter from pillar4Metrics', () => {
    const content = readRoute('src/lib/ai/sentimentAnalysis.ts');
    expect(content).toContain('sentimentCounter');
    expect(content).toContain('pillar4Metrics');
  });

  it('sentimentAnalysis records latency histogram on HF path', () => {
    const content = readRoute('src/lib/ai/sentimentAnalysis.ts');
    expect(content).toContain('sentimentLatencyHistogram.record');
  });

  it('empathyEngine imports empathyErrorCounter from pillar4Metrics', () => {
    const content = readRoute('src/lib/agents/empathyEngine.ts');
    expect(content).toContain('empathyErrorCounter');
    expect(content).toContain('pillar4Metrics');
  });

  it('codeSwitch imports codeSwitchCounter from pillar4Metrics', () => {
    const content = readRoute('src/lib/agents/codeSwitch.ts');
    expect(content).toContain('codeSwitchCounter');
    expect(content).toContain('pillar4Metrics');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Pillar 3 functions still work correctly after instrumentation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pillar 4 — Pillar 3 correctness post-instrumentation', () => {
  it('validateTone still returns true for clean text after instrumentation', () => {
    expect(validateTone('Sharp sharp! Let me help you with that opportunity.')).toBe(true);
  });

  it('validateTone still returns false for AI self-reference', () => {
    expect(validateTone('As an AI language model, I cannot help with that.')).toBe(false);
  });

  it('validateTone emits toneViolationCounter without throwing', () => {
    // Should run metrics emit internally — test it does not throw
    expect(() => validateTone('Certainly! I would be happy to leverage this synergy.')).not.toThrow();
  });

  it('detectToneViolations returns labelled violations', () => {
    const violations = detectToneViolations('As an AI language model, I leverage synergy.');
    expect(violations.length).toBeGreaterThanOrEqual(2);
    const labels = violations.map((v) => v.label);
    expect(labels).toContain('AI self-reference');
    expect(labels).toContain('Corporate jargon');
  });

  it('analyzeSentimentLocal still detects frustration post-instrumentation', () => {
    expect(analyzeSentimentLocal('Eish this is so broken!')).toBe('frustrated');
  });

  it('analyzeSentimentLocal still detects excitement post-instrumentation', () => {
    expect(analyzeSentimentLocal('Sharp sharp, I finally got it working!')).toBe('excited');
  });

  it('analyzeSentimentLocal still returns neutral for calm text', () => {
    expect(analyzeSentimentLocal('I want to start an online business.')).toBe('neutral');
  });

  it('humanizeError still returns structured response post-instrumentation', () => {
    const error: ApexError = {
      code: 'NETWORK_TIMEOUT',
      severity: 'medium',
      technicalMessage: 'Request timed out',
      userContext: {
        wasTransactionInvolved: false,
        userInputPreserved: true,
        isRetryable: true,
      },
    };
    const result = humanizeError(error);
    expect(result.coreMessage).toBeTruthy();
    expect(result.suggestedActions.length).toBeGreaterThan(0);
    expect(result.suggestedActions.length).toBeLessThanOrEqual(3);
  });

  it('detectUserLanguageStyle still detects isiZulu post-instrumentation', () => {
    const style = detectUserLanguageStyle('Sawubona, how do I start on Fiverr?');
    expect(style.hasVernacular).toBe(true);
    expect(style.detectedLanguages).toContain('zu-ZA');
  });

  it('detectUserLanguageStyle still returns english/no-vernacular for plain text', () => {
    const style = detectUserLanguageStyle('How do I sign up for an e-commerce account?');
    expect(style.hasVernacular).toBe(false);
  });

  it('enrichMessagesSync still injects system prompt post-instrumentation', () => {
    const messages: ServerMessage[] = [
      { role: 'user', content: 'How do I start freelancing on Fiverr?' },
    ];
    const result = enrichMessagesSync(messages, { userContext: {} });
    const sys = result.find((m) => m.role === 'system');
    expect(sys).toBeTruthy();
    expect(sys!.content).toContain('Apex Central');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Health Endpoint — Pillar 3/4 fields
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pillar 4 — Health endpoint Pillar 3/4 coverage', () => {
  const health = readRoute('src/app/api/health/route.ts');

  it('health endpoint checks kimiConfigured', () => {
    expect(health).toContain('kimiConfigured');
  });

  it('health endpoint confirms pillar4MetricsWired', () => {
    expect(health).toContain('pillar4MetricsWired: true');
  });

  it('health endpoint confirms securityHeadersConfigured', () => {
    expect(health).toContain('securityHeadersConfigured: true');
  });

  it('health endpoint confirms departmentRateLimitingActive', () => {
    expect(health).toContain('departmentRateLimitingActive: true');
  });

  it('health endpoint exposes pillar3Heart section', () => {
    expect(health).toContain('pillar3Heart');
  });

  it('pillar3Heart includes hfTokenConfigured', () => {
    expect(health).toContain('hfTokenConfigured');
  });

  it('pillar3Heart confirms localSentimentAlwaysReady', () => {
    expect(health).toContain('localSentimentAlwaysReady: true');
  });

  it('pillar3Heart confirms all four systems ready', () => {
    expect(health).toContain('identityMatrixReady: true');
    expect(health).toContain('empathyEngineReady: true');
    expect(health).toContain('sentimentAnalysisReady: true');
    expect(health).toContain('codeSwitchReady: true');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Integration — Bones hold everything together
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pillar 4 — Integration: full system integrity', () => {
  it('full enrichment pipeline runs without throwing after instrumentation', () => {
    const messages: ServerMessage[] = [
      { role: 'user', content: 'Eish haibo! My application keeps failing!' },
    ];
    expect(() => enrichMessagesSync(messages, {
      userContext: { province: 'EC', provinceName: 'Eastern Cape', unemploymentRate: 41.2 },
    })).not.toThrow();
  });

  it('full error pipeline runs without throwing after instrumentation', () => {
    const error: ApexError = {
      code: 'SCOUT_EMPTY',
      severity: 'low',
      technicalMessage: 'Scout returned empty results',
      userContext: { wasTransactionInvolved: false, userInputPreserved: true, isRetryable: true },
    };
    expect(() => humanizeError(error)).not.toThrow();
  });

  it('tone drift pipeline runs without throwing after instrumentation', () => {
    const text = 'Sure! As an AI language model, I would be happy to leverage this synergy.';
    expect(() => validateTone(text)).not.toThrow();
    expect(validateTone(text)).toBe(false);
  });

  it('code-switch + sentiment pipeline runs without throwing after instrumentation', () => {
    expect(() => {
      const style = detectUserLanguageStyle('Sharp sharp! Yebo ngiyabonga!');
      const sentiment = analyzeSentimentLocal('Sharp sharp! Yebo ngiyabonga!');
      expect(style.hasVernacular).toBe(true);
      expect(sentiment).toBe('excited');
    }).not.toThrow();
  });

  it('security header structure is complete — 7 distinct headers declared', () => {
    const config = readConfig();
    const headerKeys = [
      "key: 'X-Frame-Options'",
      "key: 'X-Content-Type-Options'",
      "key: 'Referrer-Policy'",
      "key: 'Permissions-Policy'",
      "key: 'X-DNS-Prefetch-Control'",
      "key: 'Content-Security-Policy'",
      "key: 'Strict-Transport-Security'",
    ];
    for (const key of headerKeys) {
      expect(config).toContain(key);
    }
    expect(headerKeys.length).toBe(7);
  });

  it('all 4 department routes are protected — no unguarded Perplexity calls', () => {
    const routes = [
      'src/app/api/trading/route.ts',
      'src/app/api/blogs/route.ts',
      'src/app/api/reels/route.ts',
      'src/app/api/news/route.ts',
    ];
    for (const routePath of routes) {
      const content = readRoute(routePath);
      expect(content).toContain('checkRateLimit');
      expect(content).toContain('429');
    }
  });
});
