/**
 * Phase 3: Pre-Sign & Stream Edge API Route
 *
 * Implements the Pre-Sign & Stream architecture for XRPL transaction
 * finality in ~3.5 seconds.
 *
 * NOTE: XRPL integration requires XRPL_SERVICE_URL environment variable.
 * Without it, transaction intents are detected but not executed.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

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

interface PreBuildResult {
  pre_signed: boolean;
  tx_json?: object;
  sequence?: number;
  error?: string;
}

function detectTransactionIntent(prompt: string): TransactionIntent | null {
  const lowerPrompt = prompt.toLowerCase();

  const patterns: Array<{ regex: RegExp; type: string }> = [
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
        amount: match[1] ?? undefined,
        currency: pattern.type === 'SEND_RLUSD' ? 'RLUSD' : 'XRP',
      };
    }
  }

  return null;
}

async function preBuildTransaction(intent: TransactionIntent): Promise<PreBuildResult> {
  const xrplServiceUrl = process.env.XRPL_SERVICE_URL;

  if (!xrplServiceUrl) {
    return {
      pre_signed: false,
      error: 'XRPL service not configured. Set XRPL_SERVICE_URL environment variable.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${xrplServiceUrl}/prebuild`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: intent.type,
        amount: intent.amount,
        currency: intent.currency,
        destination: intent.destination,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return { pre_signed: false, error: `XRPL service error: HTTP ${res.status}` };
    }

    return res.json() as Promise<PreBuildResult>;
  } catch (error) {
    return {
      pre_signed: false,
      error: `Failed to connect to XRPL service: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

function createSSEEncoder() {
  return {
    encode(event: TransactionEvent): string {
      return `data: ${JSON.stringify(event)}\n\n`;
    },
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json() as { prompt?: string };
    const { prompt } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const intent = detectTransactionIntent(prompt);
    const sseEncoder = createSSEEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();

        const send = (event: TransactionEvent) =>
          controller.enqueue(enc.encode(sseEncoder.encode(event)));

        send({ type: 'transaction_ready', intent: intent ?? undefined, timestamp: Date.now() });

        let preBuildResult: PreBuildResult | null = null;

        if (intent) {
          send({ type: 'transaction_ready', message: 'Transaction intent detected. Analyzing...', timestamp: Date.now() });

          try {
            preBuildResult = await preBuildTransaction(intent);

            if (preBuildResult.pre_signed) {
              send({ type: 'transaction_ready', intent, message: 'Transaction pre-built and ready for confirmation', timestamp: Date.now() });
            } else {
              send({ type: 'transaction_ready', intent, message: preBuildResult.error ?? 'XRPL service unavailable.', timestamp: Date.now() });
            }
          } catch (error) {
            send({ type: 'error', message: `Failed to pre-build: ${error instanceof Error ? error.message : String(error)}`, timestamp: Date.now() });
          }
        }

        const responseMessage = intent
          ? preBuildResult?.pre_signed
            ? `I've detected you want to ${intent.type.replace(/_/g, ' ').toLowerCase()} ${intent.amount ?? ''} ${intent.currency ?? 'XRP'}. Click confirm to execute on XRPL (~3-5 seconds to settle).`
            : `I've detected a transaction intent (${intent.type.replace(/_/g, ' ').toLowerCase()}), but the XRPL service is not configured. Contact support to enable blockchain transactions.`
          : 'Processing your request...';

        for (const char of responseMessage) {
          controller.enqueue(enc.encode(
            `data: ${JSON.stringify({ type: 'text', content: char })}\n\n`
          ));
          await new Promise((resolve) => setTimeout(resolve, intent ? 20 : 30));
        }

        controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
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

  } catch {
    // Do not expose internal error details to clients (information disclosure).
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<Response> {
  const xrplConfigured = !!process.env.XRPL_SERVICE_URL;

  return NextResponse.json({
    status: 'healthy',
    version: '3.0.0-phase3',
    xrpl_service: xrplConfigured ? 'configured' : 'not_configured',
    features: [
      'pre_sign_stream',
      'edge_runtime',
      'proactive_xrpl',
      'optimistic_settlement',
    ],
  });
}
