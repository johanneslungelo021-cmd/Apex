/**
 * Pillar 4 Metrics — Full Observability for Apex Identity Engine
 *
 * Exposes OpenTelemetry counters and histograms for every Pillar 3 subsystem.
 * All metrics flow through @vercel/otel → Grafana Cloud via OTLP.
 *
 * Metric naming convention:
 *   apex_<subsystem>_<measurement>_<unit>
 *   Labels: kept to <8 unique values per label to avoid cardinality explosion.
 *
 * Subsystems tracked:
 *   identity  — enrichMessages() enrichment pipeline
 *   tone      — validateTone() drift detection
 *   sentiment — analyzeSentiment() dual-tier analysis
 *   code_switch — detectUserLanguageStyle() language detection
 *   empathy   — humanizeError() error humanization pipeline
 *
 * @module lib/observability/pillar4Metrics
 */

import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('apex-pillar4-bones');

// ─── Identity Enrichment ──────────────────────────────────────────────────────

/**
 * Counts enrichMessages() invocations.
 * Labels:
 *   tier    = 'async' | 'sync'   (async = HF-eligible, sync = local-only)
 *   outcome = 'success' | 'error'
 */
export const enrichmentCounter = meter.createCounter(
  'apex_identity_enrichment_total',
  { description: 'Total identity enrichment calls by tier and outcome' }
);

/**
 * Records the wall-clock time of enrichMessages() including sentiment analysis.
 * Labels:
 *   tier = 'async' | 'sync'
 * Unit: milliseconds
 */
export const enrichmentLatencyHistogram = meter.createHistogram(
  'apex_identity_enrichment_latency_ms',
  {
    description: 'Identity enrichment latency in milliseconds',
    unit: 'ms',
  }
);

// ─── Tone Drift Detection ─────────────────────────────────────────────────────

/**
 * Counts individual tone violations detected in model output.
 * Labels:
 *   violation_type = 'AI self-reference' | 'Emotion denial' | 'Corporate jargon'
 *                  | 'Robotic refusal' | 'Generic opener' | 'Assistant self-reference'
 */
export const toneViolationCounter = meter.createCounter(
  'apex_tone_violation_total',
  { description: 'Tone drift violations detected in model output by type' }
);

/**
 * Counts validateTone() calls.
 * Labels:
 *   outcome = 'clean' | 'violated'
 */
export const toneValidationCounter = meter.createCounter(
  'apex_tone_validation_total',
  { description: 'Tone validation checks by outcome (clean or violated)' }
);

// ─── Sentiment Analysis ───────────────────────────────────────────────────────

/**
 * Counts sentiment analysis invocations.
 * Labels:
 *   tier    = 'hf' | 'local'     (hf = HuggingFace API, local = lexical)
 *   emotion = 'neutral' | 'frustrated' | 'excited' | 'confused' | 'anxious'
 *   outcome = 'success' | 'fallback' | 'cache_hit'
 */
export const sentimentCounter = meter.createCounter(
  'apex_sentiment_analysis_total',
  { description: 'Sentiment analysis calls by tier, emotion, and outcome' }
);

/**
 * Records sentiment analysis latency per tier.
 * Labels:
 *   tier = 'hf' | 'local'
 * Unit: milliseconds
 */
export const sentimentLatencyHistogram = meter.createHistogram(
  'apex_sentiment_latency_ms',
  {
    description: 'Sentiment analysis latency in milliseconds by tier',
    unit: 'ms',
  }
);

// ─── Code Switch Detection ────────────────────────────────────────────────────

/**
 * Counts language detection events.
 * Labels:
 *   language = 'zu-ZA' | 'st-ZA' | 'af-ZA' | 'slang' | 'english'
 *   detected = 'true' | 'false'  (vernacular detected vs plain English)
 */
export const codeSwitchCounter = meter.createCounter(
  'apex_code_switch_total',
  { description: 'Language style detection events by language and vernacular presence' }
);

// ─── Empathy Engine ───────────────────────────────────────────────────────────

/**
 * Counts error humanization calls.
 * Labels:
 *   error_code = 'tecPATH_DRY' | 'tecINSUF_FEE' | 'NETWORK_TIMEOUT'
 *              | 'AI_GENERATION_FAILED' | 'RATE_LIMITED' | 'SCOUT_EMPTY'
 *              | 'PERPLEXITY_UNAVAILABLE' | 'DEFAULT'
 *   severity   = 'low' | 'medium' | 'high' | 'critical'
 */
export const empathyErrorCounter = meter.createCounter(
  'apex_error_humanized_total',
  { description: 'Humanized error events by error code and severity' }
);

// ─── Rate Limiting Observability ──────────────────────────────────────────────

/**
 * Counts rate limit events on department routes.
 * Labels:
 *   route   = 'news' | 'blogs' | 'trading' | 'reels' | 'register'
 *   outcome = 'allowed' | 'blocked'
 */
export const departmentRateLimitCounter = meter.createCounter(
  'apex_department_rate_limit_total',
  { description: 'Department route rate limit events by route and outcome' }
);
