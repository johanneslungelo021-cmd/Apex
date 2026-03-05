/**
 * OpenTelemetry Instrumentation Configuration
 *
 * Initializes OpenTelemetry for distributed tracing and metrics collection.
 * Configures the OTLP exporter for Grafana Cloud integration.
 *
 * @module instrumentation
 */

import { registerOTel } from '@vercel/otel';

/**
 * OpenTelemetry instrumentation registration.
 *
 * Called automatically by Next.js during server startup when
 * experimental.instrumentationHook is enabled (or in Next.js 16+ automatically).
 *
 * Configures:
 * - Service name for trace identification
 * - OTLP exporter endpoint for Grafana Cloud
 * - Trace sampling for production efficiency
 */
export function register() {
  registerOTel({
    serviceName: 'apex-sentient-interface',
    // OTLP endpoint for Grafana Cloud
    // Set OTEL_EXPORTER_OTLP_ENDPOINT environment variable to your Grafana endpoint
    // Example: https://otlp-gateway-prod-ap-southeast-1.grafana.net/otlp
  });
}
