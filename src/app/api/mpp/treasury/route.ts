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

const mppx = Mppx.create({
  methods: [tempo({ currency: defaultToken, recipient: getRecipient(), feePayer: getFeePayer() })],
});

export const GET = mppx.tempo.session({ amount: MPP_PRICING.treasuryQuery, unitType: 'query' })(
  async (_request: Request) => {
    const requestId = generateRequestId();
    const supabase  = getSupabaseClient();

    const [poolResult, disbResult, proposalResult] = await Promise.all([
      supabase
        .from('vaal_development_pool')
        .select('id, transaction_id, amount_zar, split_pct, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('disbursement_log')
        .select('amount_zar, status, paid_at, proposal_id')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('governance_proposals')
        .select('id, title, status, vote_count_for, vote_count_against, approved_at')
        .in('status', ['approved', 'active'])
        .limit(10),
    ]);

    const pool      = poolResult.data ?? [];
    const disbLog   = disbResult.data ?? [];
    const proposals = proposalResult.data ?? [];

    const totalPoolZar = pool.reduce((s, r) => s + Number(r.amount_zar), 0);

    const sumDisbByStatus = (status: string) =>
      disbLog
        .filter(r => r.status === status)
        .reduce((s, r) => s + Number(r.amount_zar), 0);

    const treasury = {
      pool_summary: {
        total_pool_zar: Math.round(totalPoolZar * 100) / 100,
        approved_zar:   Math.round(sumDisbByStatus('approved') * 100) / 100,
        disbursed_zar:  Math.round(sumDisbByStatus('paid')     * 100) / 100,
        entries:        pool.length,
      },
      active_proposals: proposals.map(p => ({
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
