/**
 * OpenTelemetry Instrumentation Setup
 *
 * Configures OpenTelemetry for the Apex Sentient Interface application.
 * Automatically loaded by Next.js at startup to initialise distributed
 * tracing and metrics collection.
 *
 * Metrics are exported to Grafana Cloud via the OTLP protocol.
 *
 * @module instrumentation
 */

import { registerOTel } from '@vercel/otel';

/**
 * Registers OpenTelemetry instrumentation for the application.
 * Called automatically by Next.js during startup — no manual invocation needed.
 *
 * Required environment variables:
 *   GRAFANA_OTLP_ENDPOINT  — Grafana Cloud OTLP gateway URL
 *   GRAFANA_API_KEY        — Grafana Cloud API key for authentication
 */
export function register(): void {
  registerOTel({
    serviceName: 'apex-sentient-interface',
    attributes: {
      'deployment.environment': process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
      'service.version': '2.0.0-phase2',
      'service.instance.id': process.env.VERCEL_REGION || 'local',
    },
  });
}
