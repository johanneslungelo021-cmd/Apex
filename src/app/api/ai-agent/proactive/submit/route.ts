/**
 * Phase 3: Transaction Submit API Route
 * 
 * Handles the actual submission of pre-built XRPL transactions.
 * This endpoint is called when the user confirms a transaction
 * from the optimistic UI.
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
  }
  
  return { confirmed: false };
}

export async function POST(request: NextRequest) {
  try {
    const body: SubmitTransactionBody = await request.json();
    const { intent, amount, currency, destination, userId } = body;
    
    if (!intent || !destination) {
      return NextResponse.json(
        { error: 'Missing required fields: intent, destination' },
        { status: 400 }
      );
    }
    
    // Submit transaction
    const result = await submitToXRPL({
      intent,
      amount,
      currency,
      destination,
      userId,
    });
    
    // If immediate confirmation (rare), return success
    if (result.status === 'confirmed') {
      return NextResponse.json({
        status: 'confirmed',
        hash: result.hash,
        ledger: result.ledger,
      });
    }
    
    // Wait for confirmation with streaming updates
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        // Send initial submission
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ status: 'submitted', hash: result.hash })}\n\n`
        ));
        
        // Wait for confirmation
        const confirmation = await waitForConfirmation(result.hash);
        
        // Send final status
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            status: confirmation.confirmed ? 'confirmed' : 'pending',
            hash: result.hash,
            ledger: confirmation.ledger,
          })}\n\n`
        ));
        
        controller.close();
      },
    });
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
    
  } catch (error) {
    console.error('Transaction submission error:', error);
    return NextResponse.json(
      { error: 'Transaction failed', details: String(error) },
      { status: 500 }
    );
  }
}
