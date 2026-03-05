/**
 * Health Check API Route
 * 
 * Provides system health status and service configuration checks.
 * Detailed service status is only exposed when a valid internal token is provided.
 * 
 * @module api/health
 */

import { NextResponse } from 'next/server';

/**
 * Performs a timing-safe comparison of two strings to prevent timing attacks.
 * 
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns True if strings are equal, false otherwise
 * 
 * @example
 * timingSafeEqual('secret-token', 'secret-token') // true
 * timingSafeEqual('secret-token', 'wrong-token') // false
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Handles GET requests for health status.
 * 
 * Returns basic health information by default. Detailed service configuration
 * is only included when a valid x-health-token header matches HEALTH_DETAILS_TOKEN.
 * 
 * @param req - The incoming HTTP request
 * @returns JSON response with health status
 * 
 * @example
 * // Basic health check (public)
 * GET /api/health
 * // Response: { status: 'ok', timestamp: '...', environment: 'production', version: '1.0.0-phase1' }
 * 
 * // Detailed health check (internal)
 * GET /api/health
 * Header: x-health-token: your-secret-token
 * // Response: { status: 'ok', ..., services: { grafana: {...}, ai: {...}, github: true } }
 */
export async function GET(req: Request): Promise<Response> {
  // Require BOTH a non-empty configured token AND a non-empty provided token.
  // If HEALTH_DETAILS_TOKEN is unset or empty, internal details are always hidden.
  const providedToken = (req.headers.get('x-health-token') ?? '').trim();
  const expectedToken = (process.env.HEALTH_DETAILS_TOKEN ?? '').trim();

  const isInternal =
    expectedToken.length > 0 &&
    providedToken.length > 0 &&
    timingSafeEqual(providedToken, expectedToken);

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    version: '1.0.0-phase1',
    // Only show detailed service status with a valid, configured internal token
    ...(isInternal && {
      services: {
        grafana: {
          configured: !!(process.env.GRAFANA_API_KEY && process.env.GRAFANA_INSTANCE_ID),
          endpoint: process.env.GRAFANA_OTLP_ENDPOINT ? 'configured' : 'missing',
        },
        ai: {
          aiGateway: !!process.env.AI_GATEWAY_API_KEY,
          groq: !!process.env.GROQ_API_KEY,
        },
        github: !!process.env.GITHUB_TOKEN,
      }
    })
  };

  return NextResponse.json(health);
}
