/**
 * Phase 3: Transaction Submit API Route
 *
 main
 * Handles submission of pre-built XRPL transactions when the user confirms
 * an optimistic transaction from the UI.
 *
 * NOTE: The previous implementation contained Math.random()-based mock hashes
 * and simulated ledger confirmations. Those have been removed. This endpoint
 * now returns HTTP 501 until a real XRPL_SERVICE_URL is configured in the
 * environment. Set XRPL_SERVICE_URL to the URL of the Python xrpl_proactive
 * service to enable live submission.

 * Delegates XRPL transaction submission to an external Python service configured
 * via XRPL_SERVICE_URL. Returns HTTP 501 until that variable is set — no mock
 * hashes or simulated ledger numbers are generated in this file.
 *
 * To enable live submission: set XRPL_SERVICE_URL=https://<your-python-service>/submit
 * in Vercel Project → Settings → Environment Variables.
 *
 * @module app/api/ai-agent/proactive/submit
 feat/perf-cwv-zero-mocks
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

interface SubmitTransactionBody {
  intent: string;
  amount?: string;
  currency?: string;
  destination: string;
  userId: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  const xrplServiceUrl = process.env.XRPL_SERVICE_URL;
 main
  


  // Block all requests until the real service is wired in
 feat/perf-cwv-zero-mocks
  if (!xrplServiceUrl) {
    return NextResponse.json(
      { error: 'XRPL submission service not configured. Set XRPL_SERVICE_URL.' },
      { status: 501 }
    );
  }

  try {
    const body: SubmitTransactionBody = await request.json();
    const { intent, amount, currency, destination, userId } = body;

    if (!intent || !destination) {
      return NextResponse.json(
        { error: 'Missing required fields: intent, destination' },
        { status: 400 }
      );
    }

 main
    // Delegate to the external XRPL Python service
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 10_000);
    
    let res: Response;
    try {
      res = await fetch(`${xrplServiceUrl}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, amount, currency, destination, userId }),
        signal: ac.signal,
      });
    } finally {
      clearTimeout(tid);
    }

    if (!res.ok) {
      const err = await res.text().catch(() => `HTTP ${res.status}`);
      return NextResponse.json(
        { error: 'XRPL service error', details: err },
        { status: 502 }
      );
    }

    const result = await res.json();
    return NextResponse.json(result);
    

    // Delegate to the external XRPL Python service — zero mock logic here
    const res = await fetch(xrplServiceUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent, amount, currency, destination, userId }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      return NextResponse.json(
        { error: 'XRPL service error', details: errText },
        { status: 502 }
      );
    }

    const result = await res.json();
    return NextResponse.json(result);
 feat/perf-cwv-zero-mocks
  } catch (error) {
    console.error('[proactive/submit] error:', error);
    return NextResponse.json(
      { error: 'Transaction submission failed', details: String(error) },
      { status: 500 }
    );
  }
}
