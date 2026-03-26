export const runtime = 'nodejs';
/**
 * MPP Treasury Endpoint — session intent
 *
 * Vaal/Gauteng treasury pool data gated behind 0.0001 USDC per query via MPP session.
 * Session channels (TempoStreamChannel) let agents deposit once, then sign off-chain
 * EIP-712 vouchers per query with near-zero overhead.
 *
 * Receipt.reference = TempoStreamChannel channelId (bytes32 hash), NOT a tx hash.
 * The channel settles on-chain when the client calls session.close().
 *
 * https://mpp.dev/payment-methods/tempo/session
 */

import { NextResponse }             from 'next/server';
import { Mppx, tempo }              from 'mppx/nextjs';
import { getRecipient, getFeePayer, MPP_PRICING, recordMppPayment, defaultToken, SYSTEM_CREATOR_ID }
  from '@/lib/payments/mpp-server';
import { streamChannelAddress }     from '@/lib/payments/tempo-chain';
import { getSupabaseClient }        from '@/lib/supabase';
import { log, generateRequestId }   from '@/lib/api-utils';

// Lazy initializer — avoids crashing the module on cold start if env vars are missing.
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

export const GET = async (_request: Request) => {
  let mppx: ReturnType<typeof createMppx>;
  try {
    mppx = getMppx();
  } catch {
    return NextResponse.json({ error: 'MPP not configured' }, { status: 500 });
  }

  const handler = mppx.tempo.session({ amount: MPP_PRICING.treasuryQuery, unitType: 'query' })(
    async (_request: Request) => {
      const requestId = generateRequestId();
      const supabase  = getSupabaseClient();

      // Use RPC aggregation for accurate totals without truncation
      const [summaryResult, poolResult, disbResult, proposalResult] = await Promise.all([
        supabase.rpc('get_treasury_summary'),
        supabase.rpc('get_treasury_pool_entries', { p_limit: 100 }),
        supabase.rpc('get_recent_disbursements', { p_limit: 20 }),
        supabase.rpc('get_active_proposals', { p_limit: 10 }),
      ]);

      if (summaryResult.error) {
        console.error('Treasury summary RPC failed:', summaryResult.error);
        return NextResponse.json({ error: 'Treasury data unavailable' }, { status: 500 });
      }
      if (poolResult.error) {
        console.error('Treasury pool query failed:', poolResult.error);
        return NextResponse.json({ error: 'Treasury data unavailable' }, { status: 500 });
      }
      if (disbResult.error) {
        console.error('Treasury disbursement query failed:', disbResult.error);
        return NextResponse.json({ error: 'Treasury data unavailable' }, { status: 500 });
      }
      if (proposalResult.error) {
        console.error('Treasury proposal query failed:', proposalResult.error);
        return NextResponse.json({ error: 'Treasury data unavailable' }, { status: 500 });
      }

      const summary   = summaryResult.data;
      const _pool      = poolResult.data ?? [];
      const disbLog   = disbResult.data ?? [];
      const proposals = proposalResult.data ?? [];

      const treasury = {
        pool_summary: {
          total_pool_zar:   Number(summary.total_pool_zar) || 0,
          approved_zar:     Number(summary.approved_zar) || 0,
          disbursed_zar:    Number(summary.disbursed_zar) || 0,
          entries:          Number(summary.pool_entry_count) || 0,
        },
        active_proposals: proposals.map((p: { id: string; title: string; status: string; vote_count_for: number; vote_count_against: number; approved_at: string | null }) => ({
          id:            p.id,
          title:         p.title,
          status:        p.status,
          votes_for:     p.vote_count_for,
          votes_against: p.vote_count_against,
          approved_at:   p.approved_at,
        })),
        recent_disbursements: disbLog.slice(0, 5),
        generated_at: new Date().toISOString(),
        payment: {
          method:      'mpp/session',
          amount:      `${MPP_PRICING.treasuryQuery} USDC per query`,
          escrow:      streamChannelAddress,
          note:        'Receipt.reference is a TempoStreamChannel channelId, not a tx hash',
        },
      };

      await recordMppPayment({
        creatorId:        SYSTEM_CREATOR_ID,
        amountUsd:        MPP_PRICING.treasuryQuery,
        mppIntent:        'session',
        receiptReference: requestId,
      }, requestId);

      log({ level: 'info', service: 'mpp-treasury', requestId,
        message: 'Treasury data delivered via MPP session' });

      return NextResponse.json(treasury);
    },
  );
  return handler(_request);
};
