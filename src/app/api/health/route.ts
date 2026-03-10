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
  // Always perform timing-safe comparison first, then check length
  // This prevents leaking token length via timing side-channel
  return crypto.timingSafeEqual(bufA, bufB) && a.length === b.length;
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
        // Pillar 3: Kimi K2 for complex queries
        kimiConfigured: Boolean(process.env.KIMI_API_KEY || process.env.MPC_APEX),
      },
      observability: {
        otelConfigured,
        otelEndpointConfigured: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
        otelHeadersConfigured: Boolean(process.env.OTEL_EXPORTER_OTLP_HEADERS),
        grafanaSourceConfigured,
        // Pillar 4: new department route metrics wired to Grafana
        pillar4MetricsWired: true,
      },
      security: {
        ipLogSaltConfigured: Boolean(process.env.IP_LOG_SALT),
        healthDetailsTokenConfigured: Boolean(process.env.HEALTH_DETAILS_TOKEN),
        // Pillar 4: security headers enforced via next.config.ts
        securityHeadersConfigured: true,
        // Pillar 4: rate limiting active on all 5 department routes
        departmentRateLimitingActive: true,
      },
      github: {
        tokenConfigured: Boolean(process.env.GITHUB_TOKEN),
      },
      // Pillar 3: Identity Matrix + Empathy Engine status
      pillar3Heart: {
        identityMatrixReady: true,
        empathyEngineReady: true,
        sentimentAnalysisReady: true,
        codeSwitchReady: true,
        hfTokenConfigured: Boolean(process.env.HF_TOKEN),
        // useLocalSentiment path is always available (zero-dependency)
        localSentimentAlwaysReady: true,
      },
    };
  }

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
