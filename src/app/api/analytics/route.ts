import { NextResponse } from 'next/server';
import { pageViewCounter } from '../../../lib/metrics';

export async function POST() {
  // Emit page view metric
  pageViewCounter.add(1);
  
  return NextResponse.json({ success: true, metric: 'apex_page_view_total' });
}
