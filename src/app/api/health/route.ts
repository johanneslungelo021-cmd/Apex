/**
 * Health Check API Endpoint
 *
 * Provides application health status for monitoring and load balancers.
 * Supports detailed internal checks via authorization token.
 *
 * @module app/api/health
 */

import { NextResponse } from 'next/server';
import { generateRequestId, log } from '@/lib/api-utils';
import crypto from 'crypto';

/**
 * Service identifier for log entries.
 */
const SERVICE = 'health';

/**
 * Timing-safe string comparison to prevent timing attacks.
 *
 * Uses HMAC comparison to avoid timing-based information leakage
 * when comparing sensitive values like authorization tokens.
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns true if strings match, false otherwise
 */
function timingSafeEqual(a: string, b: string): boolean {
  try {
    // Use HMAC to create fixed-length buffers for comparison
    const key = crypto.randomBytes(32);
    const hmacA = crypto.createHmac('sha256', key).update(a).digest();
    const hmacB = crypto.createHmac('sha256', key).update(b).digest();
    return crypto.timingSafeEqual(hmacA, hmacB);
  } catch {
    return false;
  }
}

/**
 * GET handler for health check endpoint.
 *
 * Returns basic health status by default. Use the Authorization header
 * with a valid HEALTH_DETAILS_TOKEN to get detailed system information.
 *
 * Security features:
 * - Timing-safe token comparison
 * - Internal-only details mode
 * - No sensitive data exposure in public mode
 *
 * @param request - The incoming HTTP request
 * @returns JSON response with health status
 *
 * @example
 * // GET /api/health
 * // Response: { "status": "healthy", "timestamp": "..." }
 *
 * @example
 * // GET /api/health with Authorization: Bearer <token>
 * // Response: { "status": "healthy", "details": { ... }, "timestamp": "..." }
 */
export async function GET(request: Request) {
  const requestId = generateRequestId();
  const timestamp = new Date().toISOString();

  // Check for authorization to show detailed health
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.HEALTH_DETAILS_TOKEN;

  // Public health check (basic info only)
  const publicHealth = {
    status: 'healthy',
    timestamp,
    requestId,
  };

  // If no token configured or no auth header, return public health
  if (!expectedToken || !authHeader) {
    log({ level: 'info', service: SERVICE, message: 'Health check passed (public)', requestId });
    return NextResponse.json(publicHealth);
  }

  // Verify authorization token with timing-safe comparison
  const providedToken = authHeader.replace('Bearer ', '');
  if (!timingSafeEqual(providedToken, expectedToken)) {
    log({ level: 'warn', service: SERVICE, message: 'Health check unauthorized', requestId });
    return NextResponse.json(publicHealth);
  }

  // Authorized: return detailed health
  const detailedHealth = {
    ...publicHealth,
    details: {
      nodeEnv: process.env.NODE_ENV,
      groqConfigured: !!process.env.GROQ_API_KEY,
      githubConfigured: !!process.env.GITHUB_TOKEN,
      grafanaConfigured: !!(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
    },
  };

  log({ level: 'info', service: SERVICE, message: 'Health check passed (detailed)', requestId });
  return NextResponse.json(detailedHealth);
}
