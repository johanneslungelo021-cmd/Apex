/**
 * OpenTelemetry Metrics Module
 * 
 * Provides custom metrics counters for tracking page views, registrations,
 * and chat sessions. All metrics are exported to Grafana Cloud via OpenTelemetry.
 * 
 * @module lib/metrics
 * 
 * @example
 * import { pageViewCounter, registrationCounter, chatSessionCounter } from './lib/metrics';
 * 
 * // Record a page view
 * pageViewCounter.add(1);
 * 
 * // Record a registration with attributes
 * registrationCounter.add(1, { email_domain: 'gmail.com' });
 * 
 * // Record a chat session
 * chatSessionCounter.add(1);
 */

import { metrics } from '@opentelemetry/api';

/**
 * OpenTelemetry meter instance for the Apex application.
 * Used to create metric instruments (counters, gauges, histograms).
 */
const meter = metrics.getMeter('apex-sentient');

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
  description: 'Total page views'
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
  description: 'Total successful registrations'
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
  description: 'Total AI chat sessions'
});
