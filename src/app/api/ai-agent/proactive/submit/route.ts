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

  if (!xrplServiceUrl) {
    return NextResponse.json(
      { error: 'XRPL submission service not configured. Set XRPL_SERVICE_URL.' },
      { status: 501 }
    );
  }

  // ReturnType<typeof setTimeout> works in both Node.js and Edge runtimes.
  // NodeJS.Timeout is Node-specific and unavailable in the edge runtime.
  let tid: ReturnType<typeof setTimeout> | undefined;

  try {
    const body: SubmitTransactionBody = await request.json();
    const { intent, amount, currency, destination, userId } = body;

    if (!intent || !destination) {
      return NextResponse.json(
        { error: 'Missing required fields: intent, destination' },
        { status: 400 }
      );
    }

    const ac = new AbortController();
    tid = setTimeout(() => ac.abort(), 10_000);

    try {
      const res = await fetch(`${xrplServiceUrl}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, amount, currency, destination, userId }),
        signal: ac.signal,
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
    } finally {
      if (tid !== undefined) clearTimeout(tid);
    }

  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Gateway Timeout', details: 'The XRPL submission service timed out.' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: 'Transaction submission failed', details: String(error) },
      { status: 500 }
    );
  }
}
