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
import { getRecipient, getFeePayer, MPP_PRICING, recordMppPayment, defaultToken, SYSTEM_CREATOR_ID }
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
  const { searchParams } = new URL(request.url);
  const creatorId = searchParams.get('creator_id');

  // Validate FIRST — before any payment check
  if (!creatorId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(creatorId)) {
    return NextResponse.json(
      { error: 'creator_id is required and must be a valid UUID' },
      { status: 400 },
    );
  }

  let mppx: ReturnType<typeof createMppx>;
  try {
    mppx = getMppx();
  } catch {
    return NextResponse.json({ error: 'MPP not configured' }, { status: 500 });
  }

  const handler = mppx.tempo.charge({ amount: MPP_PRICING.analyticsQuery })(
    async (innerRequest: Request) => {
      const requestId = generateRequestId();

      const supabase = getSupabaseClient();

      // Use RPC aggregation for accurate totals without truncation
      const [analyticsResult, recentTxResult, subResult] = await Promise.all([
        supabase.rpc('get_creator_analytics', { p_creator_id: creatorId }),
        supabase.rpc('get_recent_transactions', { p_creator_id: creatorId, p_limit: 5 }),
        supabase
          .from('subscriptions')
          .select('status')
          .eq('creator_id', creatorId),
      ]);

      if (analyticsResult.error) {
        log({ level: 'error', service: 'mpp-analytics', requestId,
          message: `analytics RPC failed: ${analyticsResult.error.message}` });
        return NextResponse.json({ error: 'Analytics query failed' }, { status: 500 });
      }
      if (subResult.error) {
        log({ level: 'error', service: 'mpp-analytics', requestId,
          message: `subscriptions query failed: ${subResult.error.message}` });
        return NextResponse.json({ error: 'Analytics query failed' }, { status: 500 });
      }

      const analyticsData = analyticsResult.data;
      const transactions   = recentTxResult.data ?? [];
      const subscriptions  = subResult.data;

      const activeSubCount = subscriptions.filter(s => s.status === 'active').length;

      const analytics = {
        creator_id:               creatorId,
        total_revenue_zar:        Number(analyticsData.total_revenue_zar) || 0,
        total_fees_zar:           Number(analyticsData.total_fees_zar) || 0,
        creator_payout_zar:       Number(analyticsData.creator_payout_zar) || 0,
        active_subscribers:       activeSubCount,
        transaction_count:        Number(analyticsData.transaction_count) || 0,
        total_transaction_count:  Number(analyticsData.transaction_count) || 0,
        emotion_breakdown:        analyticsData.emotion_breakdown || {},
        latest_transactions:      transactions,
        generated_at:             new Date().toISOString(),
        note:                     'Data computed via server-side aggregation for accuracy',
      };

      // Non-blocking audit record
      void recordMppPayment({
        creatorId: SYSTEM_CREATOR_ID, // platform query fee — must NOT pollute creator analytics
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
