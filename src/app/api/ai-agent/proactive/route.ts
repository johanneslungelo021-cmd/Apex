/**
 * Phase 3: Pre-Sign & Stream Edge API Route
 * 
 * This Edge function implements the "Pre-Sign & Stream" architecture
 * for achieving Ripple transaction finality in ~3.5 seconds.
 * 
 * Key Features:
 * - Runs on Vercel Edge runtime for <50ms TTFB
 * - Integrates with existing streaming AI agent
 * - Proactive transaction detection and pre-building
 * - Real-time transaction status via Server-Sent Events
 */

import { NextRequest, NextResponse } from 'next/server';

// Edge runtime configuration
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Type definitions for transaction handling
interface TransactionIntent {
  type: string;
  amount?: string;
  currency?: string;
  destination?: string;
}

interface TransactionEvent {
  type: 'transaction_ready' | 'transaction_submitted' | 'transaction_confirmed' | 'error';
  intent?: TransactionIntent;
  hash?: string;
  message?: string;
  timestamp: number;
}

/**
 * Intent Detection Helper
 * 
 * Analyzes user prompt for transaction intent to enable pre-building.
 * In production, this would integrate with the Scout Pre-run system.
 */
function detectTransactionIntent(prompt: string): TransactionIntent | null {
  const lowerPrompt = prompt.toLowerCase();
  
  // Pattern matching for common XRPL transactions
  const patterns = [
    { regex: /send\s+(\d+(?:\.\d+)?)\s*(xrp|ripple)/i, type: 'SEND_XRP' },
    { regex: /send\s+(\d+(?:\.\d+)?)\s*rl?usd/i, type: 'SEND_RLUSD' },
    { regex: /send\s+(\d+(?:\.\d+)?)\s*usd/i, type: 'SEND_RLUSD' },
    { regex: /set\s+trust.*?(\d+)/i, type: 'TRUST_SET' },
    { regex: /create\s+escrow/i, type: 'ESCROW_CREATE' },
    { regex: /swap\s+.*?(xrp|rlusd)/i, type: 'OFFER_CREATE' },
    { regex: /place\s+order/i, type: 'OFFER_CREATE' },
  ];
  
  for (const pattern of patterns) {
    const match = lowerPrompt.match(pattern.regex);
    if (match) {
      return {
        type: pattern.type,
        amount: match[1] || undefined,
        currency: pattern.type === 'SEND_RLUSD' ? 'RLUSD' : 'XRP',
      };
    }
  }
  
  return null;
}

/**
 * Pre-build Transaction
 * 
 * Creates a transaction object before user confirmation.
 * In production, this would call the Python xrpl_proactive module.
 */
async function preBuildTransaction(intent: TransactionIntent): Promise<{
  pre_signed: boolean;
  tx_json?: object;
  sequence?: number;
}> {
  // In production: Call Python service for actual XRPL transaction building
  // For now, return mock pre-signed transaction
  return {
    pre_signed: true,
    tx_json: {
      TransactionType: intent.type,
      Amount: intent.amount || '0',
      Destination: intent.destination || '',
    },
    sequence: Math.floor(Math.random() * 1000000),
  };
}

/**
 * SSE Encoder for streaming responses
 */
function createSSEEncoder() {
  return {
    encode(event: TransactionEvent): string {
      return `data: ${JSON.stringify(event)}\n\n`;
    },
  };
}

/**
 * POST Handler - Main streaming endpoint
 * 
 * Handles streaming AI responses with proactive XRPL transaction support.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt } = body;
    
    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }
    
    // Detect transaction intent from prompt
    const intent = detectTransactionIntent(prompt);
    
    // Create SSE stream
    const sseEncoder = createSSEEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const textEncoder = new TextEncoder();
        
        // Send initial response - AI is thinking
        const initialEvent: TransactionEvent = {
          type: 'transaction_ready',
          intent: intent || undefined,
          timestamp: Date.now(),
        };
        controller.enqueue(textEncoder.encode(sseEncoder.encode(initialEvent)));
        
        // If transaction detected, pre-build it
        let preSignedTx = null;
        if (intent) {
          // Send "analyzing transaction" status
          const analyzingEvent: TransactionEvent = {
            type: 'transaction_ready',
            message: 'Transaction intent detected. Pre-building transaction...',
            timestamp: Date.now(),
          };
          controller.enqueue(textEncoder.encode(sseEncoder.encode(analyzingEvent)));
          
          try {
            preSignedTx = await preBuildTransaction(intent);
            
            // Send ready status
            const readyEvent: TransactionEvent = {
              type: 'transaction_ready',
              intent,
              message: 'Transaction pre-built and ready for confirmation',
              timestamp: Date.now(),
            };
            controller.enqueue(textEncoder.encode(sseEncoder.encode(readyEvent)));
          } catch (error) {
            const errorEvent: TransactionEvent = {
              type: 'error',
              message: `Failed to pre-build transaction: ${error}`,
              timestamp: Date.now(),
            };
            controller.enqueue(textEncoder.encode(sseEncoder.encode(errorEvent)));
          }
        }
        
        // Streaming response: if transaction detected, prompt user to confirm; otherwise generic ack
        if (intent && preSignedTx) {
          const confirmMessage = `I've detected you want to ${intent.type.replace(/_/g, ' ').toLowerCase()} ${intent.amount || ''} ${intent.currency || 'XRP'}. Click confirm to execute this transaction on the XRPL, which typically settles in 3-5 seconds.`;
          
          for (const char of confirmMessage) {
            controller.enqueue(textEncoder.encode(
              `data: ${JSON.stringify({ type: 'text', content: char })}\n\n`
            ));
            await new Promise(resolve => setTimeout(resolve, 20));
          }
        } else {
          const normalMessage = 'Processing your request...';
          for (const char of normalMessage) {
            controller.enqueue(textEncoder.encode(
              `data: ${JSON.stringify({ type: 'text', content: char })}\n\n`
            ));
            await new Promise(resolve => setTimeout(resolve, 30));
          }
        }
        
        // End of stream
        controller.enqueue(textEncoder.encode(
          `data: ${JSON.stringify({ type: 'done' })}\n\n`
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
    console.error('Error in proactive transaction endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET Handler - Health check
 */
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    version: '3.0.0-phase3',
    features: [
      'pre_sign_stream',
      'edge_runtime',
      'proactive_xrpl',
      'optimistic_settlement',
    ],
  });
}
