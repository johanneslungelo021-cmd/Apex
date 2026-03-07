// src/app/api/health/route.ts
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { APP_VERSION } from '@/lib/version';

function timingSafeEqual(a: string, b: string): boolean {
  // Pad both buffers to the same length to avoid leaking expected token length
  const maxLen = Math.max(a.length, b.length, 1);
  const bufA = Buffer.alloc(maxLen);
  const bufB = Buffer.alloc(maxLen);
  Buffer.from(a).copy(bufA);
  Buffer.from(b).copy(bufB);
  // Use Node.js built-in timing-safe comparison
  return a.length === b.length && crypto.timingSafeEqual(bufA, bufB);
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
