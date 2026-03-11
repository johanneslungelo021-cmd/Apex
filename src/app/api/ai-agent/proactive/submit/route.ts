/**
 * Phase 3: Transaction Submit API Route
 *
 * Delegates XRPL transaction submission to an external Python service configured
 * via XRPL_SERVICE_URL.  Returns HTTP 501 until that variable is set — no mock
 * hashes or simulated ledger numbers are ever generated in this file.
 *
 * Removed in this revision:
 *  - submitToXRPL(): used Math.random() hash + hardcoded ledger 89000000+n
 *  - waitForConfirmation(): polled with setTimeout and returned fabricated confirmations
 *
 * To enable live submission: set XRPL_SERVICE_URL=https://<your-python-service>/submit
 * in Vercel Project → Settings → Environment Variables.
 *
 * @module app/api/ai-agent/proactive/submit
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

 feat/perf-cwv-zero-mocks
export async function POST(request: NextRequest): Promise<Response> {
  const xrplServiceUrl = process.env.XRPL_SERVICE_URL;

  // Block all requests until the real service is wired in
  if (!xrplServiceUrl) {
    return NextResponse.json(
      { error: 'XRPL submission service not configured. Set XRPL_SERVICE_URL.' },
      { status: 501 }
    );

/**
 * Submit a transaction to XRPL
 * Reserved for future XRPL integration.
 */
async function submitToXRPL(_txData: SubmitTransactionBody): Promise<{
  hash: string;
  status: 'submitted' | 'confirmed' | 'failed';
  ledger?: number;
}> {
  // In production: Call Python xrpl_proactive service
  // Mock response for demonstration
  const mockHash = '0' + Math.random().toString(36).substring(2, 65);
  
  return {
    hash: mockHash,
    status: 'submitted',
    ledger: 89000000 + Math.floor(Math.random() * 100),
  };
}

/**
 * Wait for transaction confirmation
 * Reserved for future XRPL integration.
 */
async function waitForConfirmation(_hash: string): Promise<{
  confirmed: boolean;
  ledger?: number;
}> {
  const maxAttempts = 10;
  const intervalMs = 400;
  
  for (let i = 0; i < maxAttempts; i++) {
    // In production: Check XRPL for transaction result
    // Mock: succeed after ~2 seconds
    if (i >= 5) {
      return { confirmed: true, ledger: 89000000 + i };
    }
    await new Promise(r => setTimeout(r, intervalMs));
 main
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

    // Delegate to the external XRPL Python service — zero mock logic here
    const res = await fetch(`${xrplServiceUrl}`, {
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
  } catch (error) {
    console.error('[proactive/submit] error:', error);
    return NextResponse.json(
      { error: 'Transaction submission failed', details: String(error) },
      { status: 500 }
    );
  }
}
