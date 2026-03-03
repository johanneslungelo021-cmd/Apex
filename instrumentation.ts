import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

export function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Grafana Cloud OTLP configuration
    const grafanaOtlpEndpoint = process.env.GRAFANA_OTLP_ENDPOINT || 'https://otlp-gateway-prod-us-central1.grafana.net/otlp';
    const grafanaInstanceId = process.env.GRAFANA_INSTANCE_ID || '';
    const grafanaApiKey = process.env.GRAFANA_API_KEY || '';

    // Build auth header for Grafana Cloud
    const headers: Record<string, string> = {};
    if (grafanaInstanceId && grafanaApiKey) {
      const auth = Buffer.from(`${grafanaInstanceId}:${grafanaApiKey}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    // Create trace exporter for Grafana
    const traceExporter = new OTLPTraceExporter({
      url: `${grafanaOtlpEndpoint}/v1/traces`,
      headers,
    });

    // Create metric exporter for Grafana
    const metricExporter = new OTLPMetricExporter({
      url: `${grafanaOtlpEndpoint}/v1/metrics`,
      headers,
    });

    // Create the SDK
    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [SemanticResourceAttributes.SERVICE_NAME]: 'apex-sentient-interface',
        [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0-phase1',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'production',
      }),
      traceExporter,
      metricReader: new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 60000, // Export every minute
      }),
      instrumentations: [],
    });

    // Start the SDK
    sdk.start();

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      try {
        await sdk.shutdown();
        console.log('OpenTelemetry SDK shut down successfully');
      } catch (err) {
        console.error('Error shutting down OpenTelemetry SDK', err);
      }
    });

    console.log('📊 OpenTelemetry initialized - sending traces to Grafana Cloud');
  }
}
