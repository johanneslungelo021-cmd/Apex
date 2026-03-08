/**
 * Analytics API Route — fire-and-forget page view counter
 */
import { NextResponse } from 'next/server';
import { pageViewCounter } from '../../../lib/metrics';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  // Non-blocking: increment OTEL counter without awaiting flush
  try { pageViewCounter.add(1); } catch { /* ignore OTEL errors */ }
  return NextResponse.json({ success: true, metric: 'apex_page_view_total' });
}
