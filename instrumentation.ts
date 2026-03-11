// instrumentation.ts
//
// CRITICAL FIX (SA-2026-03-11 — FCP 14.89s root cause):
// The previous registerOTel() call was synchronous and ran on every Vercel
// function cold start. If the Grafana OTLP endpoint (otel.grafana.net) is
// unreachable from cpt1 (Cape Town), the TCP connection attempt hangs for the
// OS default timeout (~15s) before failing — blocking ALL page rendering.
//
// Fix: wrap in setImmediate so it runs AFTER the first request has been handled.
// OTEL telemetry is observability infrastructure — a failed init must NEVER block
// user-facing requests. setImmediate defers to the next iteration of the event
// loop, which happens after the current request handler has been scheduled.
//
// Evidence: FCP = LCP = 14.89s exactly (Vercel Speed Insights, 3 SA data points)
// = server sends nothing for 14.89s then dumps full HTML in one shot.
// This is the TCP timeout pattern, not a rendering issue.

import { registerOTel } from '@vercel/otel';
import { APP_VERSION } from '@/lib/version';

export function register() {
  // Fire-and-forget: OTEL init must never block the request lifecycle.
  // setImmediate defers until after the current event loop iteration,
  // so the first request is handled before OTEL even attempts to connect.
  setImmediate(() => {
    try {
      registerOTel({
        serviceName: 'apex-sentient-interface',
        attributes: {
          'deployment.environment.name':
            process.env.VERCEL_ENV || process.env.NODE_ENV || 'production',
          'service.version': APP_VERSION,
          'service.instance.id': process.env.VERCEL_REGION || 'local',
        },
      });
    } catch (err) {
      // OTEL init failure is non-fatal — log to stderr but DO NOT crash
      console.error('[instrumentation] OTEL init failed (non-fatal):', err);
    }
  });
}
