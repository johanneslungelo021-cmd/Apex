export const runtime = 'nodejs';
/**
 * MPP Analytics Endpoint — charge intent
 *
 * Creator analytics gated behind 0.001 USDC per request via MPP.
 * Uses lazy mppx initialization so a missing APEX_TEMPO_RECIPIENT
 * env var returns a proper 500 instead of crashing the module.
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

// Lazy initializer — avoids crashing the module on cold start if env vars are missing.
// We use `typeof mppxInstance` to preserve the concrete generic type that enables
// .tempo.charge() access without type errors.
function createMppx() {
  return Mppx.create({
    methods: [tempo({ currency: defaultToken, recipient: getRecipient(), feePayer: getFeePayer() })],
  });
}

let _mppx: ReturnType<typeof createMppx> | null = null;
function getMppx() {
  if (!_mppx) {
    _mppx = createMppx();
  }
  return _mppx;
}

export const GET = async (request: Request) => {
  let mppx: ReturnType<typeof createMppx>;
  try {
    mppx = getMppx();
  } catch {
    return NextResponse.json({ error: 'MPP not configured' }, { status: 500 });
  }

  const handler = mppx.tempo.charge({ amount: MPP_PRICING.analyticsQuery })(
    async (innerRequest: Request) => {
      const requestId                 = generateRequestId();
      const { searchParams }          = new URL(innerRequest.url);
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
          .limit(1000),
        supabase
          .from('subscriptions')
          .select('status')
          .eq('creator_id', creatorId),
      ]);

      if (txResult.error) {
        log({ level: 'error', service: 'mpp-analytics', requestId,
          message: `transactions query failed: ${txResult.error.message}` });
        return NextResponse.json({ error: 'Analytics query failed' }, { status: 500 });
      }
      if (subResult.error) {
        log({ level: 'error', service: 'mpp-analytics', requestId,
          message: `subscriptions query failed: ${subResult.error.message}` });
        return NextResponse.json({ error: 'Analytics query failed' }, { status: 500 });
      }

      const transactions  = txResult.data;   // guaranteed non-null after error check above
      const subscriptions = subResult.data;

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
        total_revenue_zar:   totalRevenue,
        total_fees_zar:      totalFees,
        creator_payout_zar:  totalRevenue - totalFees,
        active_subscribers:  activeSubCount,
        transaction_count:   transactions.length,
        emotion_breakdown:   emotionBreakdown,
        latest_transactions: transactions.slice(0, 5),
        generated_at:        new Date().toISOString(),
        note: transactions.length === 1000 ? 'Results capped at 1000 rows — paginate for complete history' : undefined,
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

  return handler(request);
};
