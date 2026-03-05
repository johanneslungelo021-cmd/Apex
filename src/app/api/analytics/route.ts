/**
 * Analytics API Route
 * 
 * Tracks page view events and emits metrics to Grafana via OpenTelemetry.
 * Called by the client-side page component on mount.
 * 
 * @module api/analytics
 */

import { NextResponse } from 'next/server';
import { pageViewCounter } from '../../../lib/metrics';

/**
 * Handles POST requests to record a page view event.
 * 
 * Increments the apex_page_view_total counter in Grafana.
 * This endpoint is called automatically when the main page loads.
 * 
 * @returns JSON response confirming the metric was recorded
 * 
 * @example
 * // Request
 * POST /api/analytics
 * 
 * // Response
 * { "success": true, "metric": "apex_page_view_total" }
 */
export async function POST(): Promise<Response> {
  // Emit page view metric to OpenTelemetry
  pageViewCounter.add(1);
  
  return NextResponse.json({ success: true, metric: 'apex_page_view_total' });
}
