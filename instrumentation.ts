// instrumentation.ts
//
// CRITICAL FIX (SA-2026-03-11 — FCP 14.89s root cause):
// The previous registerOTel() call was synchronous and ran on every Vercel
// function cold start. If the Grafana OTLP endpoint is unreachable from cpt1,
// the TCP connection attempt hangs for the OS default timeout (~15s) before
// failing — blocking ALL page rendering.
//
// Fix: wrap in setTimeout(fn, 0) so it runs after the current call stack clears.
// setTimeout is available in ALL Next.js runtimes (Node.js + Edge + Vercel).
// setImmediate is Node.js-only and is rejected by the Edge Runtime linter.
//
// OTEL telemetry is observability infrastructure — a failed init must NEVER
// block user-facing requests. Fire-and-forget is intentional and correct.

import { registerOTel } from '@vercel/otel';
import { APP_VERSION } from '@/lib/version';

export function register() {
  // Fire-and-forget: OTEL init must never block the request lifecycle.
  // setTimeout(fn, 0) defers until after the current call stack is empty,
  // so the first request is fully scheduled before OTEL attempts to connect.
  // Unlike setImmediate (Node-only), setTimeout works in ALL runtimes.
  setTimeout(() => {
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
  }, 0);
}
