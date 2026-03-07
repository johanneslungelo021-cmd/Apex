/**
 * OpenTelemetry Instrumentation Setup
 *
 * Configures OpenTelemetry for the Apex Sentient Interface application.
 * This file is automatically loaded by Next.js at startup to initialize
 * distributed tracing and metrics collection.
 *
 * Metrics are exported to Grafana Cloud via the OTLP protocol.
 * @vercel/otel automatically reads OTEL_EXPORTER_OTLP_ENDPOINT
 * and OTEL_EXPORTER_OTLP_HEADERS from environment variables.
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
 * - service.version: Current application version (Phase 2)
 * - service.instance.id: Vercel region or 'local' for development
 *
 * Required environment variables:
 * - OTEL_EXPORTER_OTLP_ENDPOINT: Grafana Cloud OTLP gateway URL
 *   (derived from GRAFANA_OTLP_ENDPOINT if not set)
 * - OTEL_EXPORTER_OTLP_HEADERS: Authorization header for Grafana Cloud
 *   Format: Authorization=Basic <base64(instanceId:apiKey)>
 *
 * @example
 * // Generate OTEL_EXPORTER_OTLP_HEADERS:
 * echo -n "${GRAFANA_INSTANCE_ID}:${GRAFANA_API_KEY}" | base64
 * // Then set: OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <that_base64_string>
 */
export function register(): void {
  registerOTel({
    serviceName: 'apex-sentient-interface',
    attributes: {
      'deployment.environment': process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
      'service.version': '2.1.0-phase2',
      'service.instance.id': process.env.VERCEL_REGION || 'local',
      'service.namespace': 'apex',
      'telemetry.sdk.language': 'typescript',
      'telemetry.sdk.name': 'opentelemetry',
    },
  });
}
