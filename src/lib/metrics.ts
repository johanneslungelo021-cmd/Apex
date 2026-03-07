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
 * @module lib/metrics
 *
 * @example
 * import { pageViewCounter, scoutRunCounter } from './lib/metrics';
 *
 * // Record a page view
 * pageViewCounter.add(1);
 *
 * // Record a successful scout run
 * scoutRunCounter.add(1, { status: 'success' });
 */

import { metrics } from '@opentelemetry/api';

/**
 * OpenTelemetry meter instance for the Apex application.
 * Used to create metric instruments (counters, gauges, histograms).
 */
const meter = metrics.getMeter('apex-sentient');

// ─── Phase 1 Metrics ──────────────────────────────────────────────────────────

/**
 * Counter for tracking total page views across the application.
 * Incremented on each page load via the /api/analytics endpoint.
 *
 * Metric name: `apex_page_view_total`
 *
 * @example
 * pageViewCounter.add(1);
 */
export const pageViewCounter = meter.createCounter('apex_page_view_total', {
  description: 'Total page views',
});

/**
 * Counter for tracking successful user registrations.
 * Includes email domain as an attribute for segmentation analysis.
 * PII (email address) is never exposed - only the domain is recorded.
 *
 * Metric name: `apex_registration_total`
 *
 * @example
 * registrationCounter.add(1, {
 *   email_domain: 'gmail.com',
 *   environment: 'production'
 * });
 */
export const registrationCounter = meter.createCounter('apex_registration_total', {
  description: 'Total successful registrations',
});

/**
 * Counter for tracking AI chat sessions.
 * Incremented after each successful response from the AI assistant.
 *
 * Metric name: `apex_chat_session_total`
 *
 * @example
 * chatSessionCounter.add(1);
 */
export const chatSessionCounter = meter.createCounter('apex_chat_session_total', {
  description: 'Total AI chat sessions',
});

// ─── Phase 2 Metrics ──────────────────────────────────────────────────────────

/**
 * Counter for tracking scout agent runs by status.
 * Tagged with status: 'success' | 'timeout' | 'error'.
 * Used to monitor the health and reliability of opportunity discovery.
 *
 * Metric name: `apex_scout_run_total`
 *
 * @example
 * scoutRunCounter.add(1, { status: 'success' });
 * scoutRunCounter.add(1, { status: 'timeout' });
 * scoutRunCounter.add(1, { status: 'error' });
 */
export const scoutRunCounter = meter.createCounter('apex_scout_run_total', {
  description: 'Total scout agent runs by status',
});

/**
 * Counter for tracking total valid opportunities found per scout run.
 * Counter because the domain range is 0-10 with no meaningful percentile distribution.
 * Used to measure the yield of the scout agent's opportunity discovery.
 *
 * Metric name: `apex_scout_opportunities_found_total`
 *
 * @example
 * scoutOpportunitiesCounter.add(opportunities.length);
 */
export const scoutOpportunitiesCounter = meter.createCounter('apex_scout_opportunities_found_total', {
  description: 'Total valid opportunities found by the scout agent',
});

/**
 * Counter for tracking AI agent queries via /api/ai-agent.
 * Tagged with status: 'success' | 'timeout' | 'error' and tier: 'simple' | 'complex' | 'research'.
 * Used to monitor the health and reliability of the intelligent engine.
 *
 * Metric name: `apex_agent_query_total`
 *
 * @example
 * agentQueryCounter.add(1, { status: 'success', tier: 'simple' });
 * agentQueryCounter.add(1, { status: 'timeout', tier: 'complex' });
 */
export const agentQueryCounter = meter.createCounter('apex_agent_query_total', {
  description: 'Total AI agent queries by status and tier',
});

/**
 * Histogram for tracking AI agent query latency in milliseconds.
 * Buckets optimized for API response times (50ms to 30s).
 * Tagged with tier: 'simple' | 'complex' | 'research'.
 *
 * Metric name: `apex_agent_query_duration_ms`
 *
 * @example
 * agentQueryHistogram.record(1250, { tier: 'simple', provider: 'groq' });
 */
export const agentQueryHistogram = meter.createHistogram('apex_agent_query_duration_ms', {
  description: 'AI agent query latency in milliseconds',
});

/**
 * Histogram for tracking Scout agent run latency in milliseconds.
 * Buckets optimized for background job times (100ms to 30s).
 *
 * Metric name: `apex_scout_run_duration_ms`
 *
 * @example
 * scoutRunHistogram.record(3500);
 */
export const scoutRunHistogram = meter.createHistogram('apex_scout_run_duration_ms', {
  description: 'Scout agent run latency in milliseconds',
});

/**
 * Counter for tracking estimated cost in USD per query.
 * Tagged with tier and model for cost attribution.
 *
 * Metric name: `apex_agent_estimated_cost_usd`
 *
 * @example
 * agentCostCounter.add(0.000145, { tier: 'simple', model: 'llama-3.1-8b-instant' });
 */
export const agentCostCounter = meter.createCounter('apex_agent_estimated_cost_usd', {
  description: 'Estimated cost in USD per AI agent query',
});
