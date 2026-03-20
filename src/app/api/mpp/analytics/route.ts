export const runtime = 'nodejs';
/**
 * MPP Analytics Endpoint — charge intent
 *
 * Creator analytics gated behind 0.001 USDC per request via MPP.
 * Uses the mppx/nextjs charge pattern: module-level mppx const so TypeScript
 * infers the concrete generic type, enabling .tempo.charge() access.
 *
 * MPP protocol flow (HTTP 402):
 *   GET /api/mpp/analytics?creator_id=<uuid>
 *   → 402 WWW-Authenticate: Payment tempo charge ...   (no credential)
 *   → 200 Payment-Receipt: <tx-hash>                   (payment verified)
 *
 * https://mpp.dev/payment-methods/tempo/charge
 */

import { NextResponse }             from 'next/server';
import { Mppx, tempo }              from 'mppx/nextjs';
import { getRecipient, getFeePayer, MPP_PRICING, recordMppPayment, defaultToken }
  from '@/lib/payments/mpp-server';
import { getSupabaseClient }        from '@/lib/supabase';
import { log, generateRequestId }   from '@/lib/api-utils';

// Module-level const — TypeScript infers the full concrete generic type,
// enabling mppx.tempo.charge() access without type errors.
const mppx = Mppx.create({
  methods: [tempo({ currency: defaultToken, recipient: getRecipient(), feePayer: getFeePayer() })],
});

export const GET = mppx.tempo.charge({ amount: MPP_PRICING.analyticsQuery })(
  async (request: Request) => {
    const requestId                 = generateRequestId();
    const { searchParams }          = new URL(request.url);
    const creatorId                 = searchParams.get('creator_id');

    if (!creatorId) {
      return NextResponse.json({ error: 'creator_id required' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    const [txResult, subResult] = await Promise.all([
      supabase
        .from('transactions')
        .select('amount_zar, platform_fee_zar, emotion_state, created_at, gateway')
        .eq('creator_id', creatorId)
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('subscriptions')
        .select('status')
        .eq('creator_id', creatorId),
    ]);

    const transactions  = txResult.data ?? [];
    const subscriptions = subResult.data ?? [];

    const totalRevenue   = transactions.reduce((s, t) => s + Number(t.amount_zar), 0);
    const totalFees      = transactions.reduce((s, t) => s + Number(t.platform_fee_zar), 0);
    const activeSubCount = subscriptions.filter(s => s.status === 'active').length;

    const emotionBreakdown = transactions.reduce<Record<string, number>>((acc, t) => {
      const state = t.emotion_state ?? 'neutral';
      acc[state]  = (acc[state] ?? 0) + 1;
      return acc;
    }, {});

    const analytics = {
      creator_id:          creatorId,
      total_revenue_zar:   Math.round(totalRevenue * 100)            / 100,
      total_fees_zar:      Math.round(totalFees * 100)               / 100,
      creator_payout_zar:  Math.round((totalRevenue - totalFees) * 100) / 100,
      active_subscribers:  activeSubCount,
      transaction_count:   transactions.length,
      emotion_breakdown:   emotionBreakdown,
      latest_transactions: transactions.slice(0, 5),
      generated_at:        new Date().toISOString(),
    };

    // Non-blocking audit record
    void recordMppPayment({
      creatorId,
      amountUsd:        MPP_PRICING.analyticsQuery,
      mppIntent:        'charge',
      receiptReference: requestId,
    }, requestId);

    log({ level: 'info', service: 'mpp-analytics', requestId,
      message: `Analytics delivered — creator ${creatorId}`, txCount: transactions.length });

    return NextResponse.json(analytics);
  },
);
