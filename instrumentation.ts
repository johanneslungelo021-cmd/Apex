/**
 * OpenTelemetry Instrumentation Setup
 *
 * Configures OpenTelemetry for the Apex Sentient Interface application.
 * This file is automatically loaded by Next.js at startup to initialize
 * distributed tracing and metrics collection.
 *
 * Metrics are exported to Grafana Cloud via the OTLP protocol.
 *
 * @module instrumentation
 *
 * @see https://vercel.com/docs/observability/otel-overview
 * @see https://opentelemetry.io/docs/
 */

import { registerOTel } from '@vercel/otel';

/**
 * Registers OpenTelemetry instrumentation for the application.
 *
 * This function is called automatically by Next.js during startup.
 * It configures the OTel service name and deployment attributes that
 * are attached to all traces and metrics.
 *
 * Configuration:
 * - serviceName: 'apex-sentient-interface' - Identifies this service in traces
 * - deployment.environment: Production, preview, or development
 * - service.version: Current application version
 * - service.instance.id: Vercel region or 'local' for development
 *
 * Required environment variables:
 * - GRAFANA_OTLP_ENDPOINT: Grafana Cloud OTLP gateway URL
 * - GRAFANA_API_KEY: Grafana Cloud API key for authentication
 *
 * @example
 * // This function is called automatically by Next.js
 * // No manual invocation needed
 *
 * // Environment setup in .env:
 * GRAFANA_OTLP_ENDPOINT=https://otlp-gateway-prod-ap-southeast-1.grafana.net/otlp
 * GRAFANA_API_KEY=your_grafana_api_key
 */
export function register(): void {
  registerOTel({
    serviceName: 'apex-sentient-interface',
    attributes: {
      'deployment.environment': process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
      'service.version': '1.0.0-phase1',
      'service.instance.id': process.env.VERCEL_REGION || 'local',
    },
  });
}
