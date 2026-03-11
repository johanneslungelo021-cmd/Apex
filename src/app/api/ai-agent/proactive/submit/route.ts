/**
 * Phase 3: Transaction Submit API Route
 *
 * Handles submission of pre-built XRPL transactions when the user confirms
 * an optimistic transaction from the UI.
 *
 * NOTE: The previous implementation contained Math.random()-based mock hashes
 * and simulated ledger confirmations.  Those have been removed.  This endpoint
 * now returns HTTP 501 until a real XRPL_SERVICE_URL is configured in the
 * environment.  Set XRPL_SERVICE_URL to the URL of the Python xrpl_proactive
 * service to enable live submission.
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

 feat/audit-remove-all-simulations
export async function POST(request: NextRequest): Promise<Response> {
  const xrplServiceUrl = process.env.XRPL_SERVICE_URL;
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
 perf/speed-insights-improvements
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

    // Delegate to the external XRPL Python service.
    const res = await fetch(`${xrplServiceUrl}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent, amount, currency, destination, userId }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => `HTTP ${res.status}`);
      return NextResponse.json(
        { error: 'XRPL service error', details: err },
        { status: 502 }
      );
    }

    const result = await res.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Transaction submission error:', error);
    return NextResponse.json(
      { error: 'Transaction submission failed', details: String(error) },
      { status: 500 }
    );
  }
}
