// src/app/api/health/route.ts
import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/version';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function GET(req: Request) {
  const providedToken = req.headers.get('x-health-token') || '';
  const expectedToken = process.env.HEALTH_DETAILS_TOKEN || '';

  const isInternal =
    providedToken.length > 0 &&
    expectedToken.length > 0 &&
    timingSafeEqual(providedToken, expectedToken);

  const otelConfigured = Boolean(
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
      process.env.OTEL_EXPORTER_OTLP_HEADERS
  );

  const grafanaSourceConfigured = Boolean(
    process.env.GRAFANA_API_KEY &&
      process.env.GRAFANA_INSTANCE_ID &&
      process.env.GRAFANA_OTLP_ENDPOINT
  );

  const payload = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment:
      process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    version: APP_VERSION,
  } as Record<string, unknown>;

  if (isInternal) {
    payload.services = {
      ai: {
        groqConfigured: Boolean(process.env.GROQ_API_KEY),
        perplexityConfigured: Boolean(process.env.PERPLEXITY_API_KEY),
        aiGatewayConfigured: Boolean(process.env.AI_GATEWAY_API_KEY),
      },
      observability: {
        otelConfigured,
        otelEndpointConfigured: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
        otelHeadersConfigured: Boolean(process.env.OTEL_EXPORTER_OTLP_HEADERS),
        grafanaSourceConfigured,
      },
      security: {
        ipLogSaltConfigured: Boolean(process.env.IP_LOG_SALT),
        healthDetailsTokenConfigured: Boolean(process.env.HEALTH_DETAILS_TOKEN),
      },
      github: {
        tokenConfigured: Boolean(process.env.GITHUB_TOKEN),
      },
    };
  }

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
