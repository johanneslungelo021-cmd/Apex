/**
 * OpenTelemetry Metrics Module — Phase 2 Enhanced
 *
 * Provides custom metrics counters and histograms for Phase 1 and Phase 2
 * of the Apex platform. All metrics are exported to Grafana Cloud via OpenTelemetry.
 *
 * Phase 1 Metrics:
 * - apex_page_view_total: Page views tracked via /api/analytics
 * - apex_registration_total: User registrations via /api/register
 * - apex_chat_session_total: AI chat sessions via /api/assistant
 *
 * Phase 2 Metrics:
 * - apex_scout_run_total: Scout agent runs by status
 * - apex_scout_opportunities_found_total: Valid opportunities found
 * - apex_agent_query_total: AI agent queries by status and tier
 * - apex_inference_latency_ms: AI inference latency histogram
 * - apex_estimated_cost_usd: Accumulated cost by tier
 *
 * Security Metrics:
 * - apex_ssrf_block_total: SSRF attempts blocked
 * - apex_payload_reject_total: Payload size violations
 * - apex_rate_limit_total: Rate limit rejections
 *
 * @module lib/metrics
 */

import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('apex-sentient');

// ══════════════════════════════════════════════════════════════
// Phase 1 Counters
// ══════════════════════════════════════════════════════════════

/**
 * Counter for tracking total page views across the application.
 */
export const pageViewCounter = meter.createCounter('apex_page_view_total', {
  description: 'Total page views',
});

/**
 * Counter for tracking successful user registrations.
 */
export const registrationCounter = meter.createCounter('apex_registration_total', {
  description: 'Total successful registrations',
});

/**
 * Counter for tracking AI chat sessions.
 */
export const chatSessionCounter = meter.createCounter('apex_chat_session_total', {
  description: 'Total AI chat sessions',
});

// ══════════════════════════════════════════════════════════════
// Phase 2 Counters
// ══════════════════════════════════════════════════════════════

/**
 * Counter for tracking scout agent runs by status.
 * Tagged with status: 'success' | 'timeout' | 'error'.
 */
export const scoutRunCounter = meter.createCounter('apex_scout_run_total', {
  description: 'Total scout agent runs by status',
});

/**
 * Counter for tracking total valid opportunities found per scout run.
 */
export const scoutOpportunitiesCounter = meter.createCounter('apex_scout_opportunities_found_total', {
  description: 'Total valid opportunities found by the scout agent',
});

/**
 * Counter for tracking AI agent queries via /api/ai-agent.
 * Tagged with status: 'success' | 'timeout' | 'error' and tier: 'simple' | 'complex' | 'research'.
 */
export const agentQueryCounter = meter.createCounter('apex_agent_query_total', {
  description: 'Total AI agent queries by status and tier',
});

// ══════════════════════════════════════════════════════════════
// Phase 2 Histograms
// ══════════════════════════════════════════════════════════════

/**
 * Histogram for tracking AI inference latency in milliseconds.
 * Tagged with tier, provider, and model.
 */
export const inferenceLatencyHistogram = meter.createHistogram('apex_inference_latency_ms', {
  description: 'AI inference latency in milliseconds by provider and tier',
  unit: 'ms',
});

/**
 * Histogram for tracking Scout agent run latency in milliseconds.
 */
export const scoutRunHistogram = meter.createHistogram('apex_scout_run_duration_ms', {
  description: 'Scout agent run latency in milliseconds',
});

// ══════════════════════════════════════════════════════════════
// Cost Tracking
// ══════════════════════════════════════════════════════════════

/**
 * Counter for tracking estimated cost in USD per query.
 * Tagged with tier and model for cost attribution.
 */
export const costAccumulator = meter.createCounter('apex_estimated_cost_usd', {
  description: 'Accumulated estimated inference cost in USD',
});

/**
 * Counter for tracking cost estimates (legacy alias).
 */
export const agentCostCounter = costAccumulator;

// ══════════════════════════════════════════════════════════════
// Cache Metrics
// ══════════════════════════════════════════════════════════════

/**
 * Counter for cache hits by cache type.
 */
export const cacheHitCounter = meter.createCounter('apex_cache_hit_total', {
  description: 'Cache hits by cache type (news, scout, response)',
});

/**
 * Counter for cache misses by cache type.
 */
export const cacheMissCounter = meter.createCounter('apex_cache_miss_total', {
  description: 'Cache misses by cache type',
});

// ══════════════════════════════════════════════════════════════
// Security Metrics
// ══════════════════════════════════════════════════════════════

/**
 * Counter for SSRF attempts blocked by assertSafeUrl.
 */
export const ssrfBlockCounter = meter.createCounter('apex_ssrf_block_total', {
  description: 'SSRF attempts blocked by assertSafeUrl',
});

/**
 * Counter for requests rejected for exceeding payload size limits.
 */
export const payloadRejectCounter = meter.createCounter('apex_payload_reject_total', {
  description: 'Requests rejected for exceeding payload size limits',
});

/**
 * Counter for requests rejected by rate limiter.
 */
export const rateLimitCounter = meter.createCounter('apex_rate_limit_total', {
  description: 'Requests rejected by rate limiter',
});

// ══════════════════════════════════════════════════════════════
// News Route Metrics
// ══════════════════════════════════════════════════════════════

/**
 * Counter for news feed refresh attempts.
 */
export const newsRefreshCounter = meter.createCounter('apex_news_refresh_total', {
  description: 'News feed refresh attempts',
});

/**
 * Counter for OG image extraction attempts by result.
 */
export const ogImageFetchCounter = meter.createCounter('apex_og_image_fetch_total', {
  description: 'OG image extraction attempts by result (success, fallback, ssrf_blocked)',
});

// ══════════════════════════════════════════════════════════════
// Legacy Aliases (for backward compatibility)
// ══════════════════════════════════════════════════════════════

/**
 * @deprecated Use inferenceLatencyHistogram instead
 */
export const agentQueryHistogram = inferenceLatencyHistogram;
