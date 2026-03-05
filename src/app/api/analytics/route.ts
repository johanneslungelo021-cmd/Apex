/**
 * Analytics API Endpoint
 *
 * Records page view events to OpenTelemetry metrics.
 * Called by the frontend on page load to track visitor traffic.
 *
 * @module app/api/analytics
 */

import { NextResponse } from 'next/server';
import { pageViewCounter } from '@/lib/metrics';

/**
 * POST handler for analytics page view tracking.
 *
 * Increments the page view counter and returns a success response.
 * The endpoint is designed to be fire-and-forget from the frontend.
 *
 * @returns JSON response with success status
 *
 * @example
 * // POST /api/analytics
 * // Response: { "success": true }
 */
export async function POST() {
  // Record page view metric
  pageViewCounter.add(1, {
    environment: process.env.NODE_ENV || 'development',
  });

  return NextResponse.json({ success: true });
}
