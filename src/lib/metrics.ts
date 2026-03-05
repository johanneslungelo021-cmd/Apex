/**
 * OpenTelemetry Metrics Module
 *
 * Provides custom metrics counters for tracking application telemetry.
 * All metrics are exported to Grafana Cloud via OpenTelemetry.
 *
 * Phase 1 Metrics:
 * - apex_page_view_total: Total page views
 * - apex_registration_total: Successful user registrations
 * - apex_chat_session_total: AI chat sessions
 *
 * Phase 2 Metrics:
 * - apex_scout_run_total: Scout agent runs by status
 * - apex_scout_opportunities_found_total: Opportunities found
 * - apex_agent_query_total: AI agent queries by status
 *
 * @module lib/metrics
 *
 * @example
 * import {
 *   pageViewCounter,
 *   registrationCounter,
 *   chatSessionCounter,
 *   scoutRunCounter,
 *   scoutOpportunitiesCounter,
 *   agentQueryCounter
 * } from '@/lib/metrics';
 *
 * // Record a page view
 * pageViewCounter.add(1);
 *
 * // Record a scout run with status
 * scoutRunCounter.add(1, { status: 'success' });
 */

import { metrics } from '@opentelemetry/api';

// ─── Meter Instance ───────────────────────────────────────────────────────────

/**
 * OpenTelemetry meter instance for the Apex application.
 * Used to create metric instruments (counters, gauges, histograms).
 * Meter is named 'apex-sentient' for identification in Grafana.
 */
const meter = metrics.getMeter('apex-sentient');

// ─── Phase 1 Metrics ──────────────────────────────────────────────────────────

/**
 * Counter for tracking total page views across the application.
 *
 * Incremented on each page load via the /api/analytics endpoint.
 * Used to measure overall traffic and engagement.
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
 *
 * Includes email domain as an attribute for segmentation analysis.
 * PII (email address) is never exposed - only the domain is recorded.
 * Environment attribute distinguishes between dev/staging/production.
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
 *
 * Incremented after each successful response from the AI assistant.
 * Used to measure AI feature engagement.
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
 * Counter for tracking Scout Agent runs by status.
 *
 * Tagged with status: 'success' | 'timeout' | 'error' to monitor
 * agent health and identify issues in opportunity discovery.
 *
 * Metric name: `apex_scout_run_total`
 *
 * @example
 * // Successful scout run
 * scoutRunCounter.add(1, { status: 'success' });
 *
 * @example
 * // Scout timeout
 * scoutRunCounter.add(1, { status: 'timeout' });
 */
export const scoutRunCounter = meter.createCounter('apex_scout_run_total', {
  description: 'Total scout agent runs by status',
});

/**
 * Counter for tracking valid opportunities found per scout run.
 *
 * Uses a counter (rather than histogram) because the domain range
 * is 0-10 with no meaningful percentile distribution. This metric
 * helps identify when the Scout Agent is finding fewer opportunities.
 *
 * Metric name: `apex_scout_opportunities_found_total`
 *
 * @example
 * // Record 3 opportunities found
 * scoutOpportunitiesCounter.add(3);
 */
export const scoutOpportunitiesCounter = meter.createCounter('apex_scout_opportunities_found_total', {
  description: 'Total valid opportunities found by the scout agent',
});

/**
 * Counter for tracking AI Agent queries by status.
 *
 * Tagged with status: 'success' | 'timeout' | 'error' to monitor
 * the Intelligent Engine's health and performance.
 *
 * Metric name: `apex_agent_query_total`
 *
 * @example
 * // Successful query
 * agentQueryCounter.add(1, { status: 'success' });
 *
 * @example
 * // Query error
 * agentQueryCounter.add(1, { status: 'error' });
 */
export const agentQueryCounter = meter.createCounter('apex_agent_query_total', {
  description: 'Total AI agent queries by status',
});
