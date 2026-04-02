/**
 * OpenTelemetry Metrics Module
 *
 * Provides custom metrics counters for Phase 1 and Phase 2 of the Apex platform.
 * All metrics are exported to Grafana Cloud via OpenTelemetry.
 *
 * Phase 1 Metrics:
 * - apex_page_view_total: Page views tracked via /api/analytics
 * - apex_registration_total: User registrations via /api/register
 * - apex_chat_session_total: AI chat sessions via /api/assistant
 *
 * Phase 2 Metrics:
 * - apex_scout_run_total: Scout agent runs by status
 * - apex_scout_opportunities_found_total: Valid opportunities found
 * - apex_agent_query_total: AI agent queries by status
 *
 * Security Metrics:
 * - apex_ssrf_block_total: SSRF attempts blocked
 * - apex_payload_reject_total: Requests rejected for payload size
 * - apex_rate_limit_total: Requests rejected by rate limiter
 *
 * @module lib/metrics
 */

import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("apex-sentient");

// ─── Phase 1 Metrics ──────────────────────────────────────────────────────────

export const pageViewCounter = meter.createCounter("apex_page_view_total", {
  description: "Total page views",
});

export const registrationCounter = meter.createCounter(
  "apex_registration_total",
  {
    description: "Total successful registrations",
  },
);

export const chatSessionCounter = meter.createCounter(
  "apex_chat_session_total",
  {
    description: "Total AI chat sessions",
  },
);

// ─── Phase 2 Metrics ──────────────────────────────────────────────────────────

export const scoutRunCounter = meter.createCounter("apex_scout_run_total", {
  description: "Total scout agent runs by status",
});

export const scoutOpportunitiesCounter = meter.createCounter(
  "apex_scout_opportunities_found_total",
  { description: "Total valid opportunities found by the scout agent" },
);

export const agentQueryCounter = meter.createCounter("apex_agent_query_total", {
  description: "Total AI agent queries by status and tier",
});

// ─── Phase 2+ latency histogram + cost tracking ──────────────────────────────

export const inferenceLatencyHistogram = meter.createHistogram(
  "apex_inference_latency_ms",
  {
    description: "AI inference latency in milliseconds by provider and tier",
    unit: "ms",
  },
);

export const costAccumulator = meter.createCounter("apex_estimated_cost_usd", {
  description: "Accumulated estimated inference cost in USD",
});

// ─── Security metrics ─────────────────────────────────────────────────────────

export const ssrfBlockCounter = meter.createCounter("apex_ssrf_block_total", {
  description: "SSRF attempts blocked by assertSafeUrl (IPv4 + IPv6)",
});

export const payloadRejectCounter = meter.createCounter(
  "apex_payload_reject_total",
  { description: "Requests rejected for exceeding payload size limits" },
);

export const rateLimitCounter = meter.createCounter("apex_rate_limit_total", {
  description: "Requests rejected by rate limiter",
});

// ─── Cache metrics ────────────────────────────────────────────────────────────

export const cacheHitCounter = meter.createCounter("apex_cache_hit_total", {
  description: "Cache hits by cache type (news, scout, response)",
});

export const cacheMissCounter = meter.createCounter("apex_cache_miss_total", {
  description: "Cache misses by cache type",
});

// ─── News route metrics ───────────────────────────────────────────────────────

export const newsRefreshCounter = meter.createCounter(
  "apex_news_refresh_total",
  {
    description: "News feed refresh attempts by status",
  },
);

export const ogImageFetchCounter = meter.createCounter(
  "apex_og_image_fetch_total",
  {
    description:
      "OG image extraction attempts by result (success, fallback, ssrf_blocked)",
  },
);
