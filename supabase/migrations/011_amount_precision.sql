-- Migration 011: Increase monetary precision for sub-cent MPP micro-payments

-- Step 1: Drop all overloaded versions of insert_transaction_serializable
DROP FUNCTION IF EXISTS public.insert_transaction_serializable(uuid,uuid,numeric,numeric,text,text,text,text,text,text,boolean,text,boolean,text,text,text,text,jsonb);
DROP FUNCTION IF EXISTS public.insert_transaction_serializable(uuid,uuid,numeric,numeric,text,text,text,text,text,text,boolean,text,boolean,text,text,text,text,jsonb,text,text,text,text,numeric,uuid);
DROP FUNCTION IF EXISTS public.insert_transaction_serializable(uuid,uuid,numeric,numeric,text,text,text,text,text,text,boolean,text,boolean,text,text,text,text,jsonb,text,text,text,text,text,integer,text,numeric);

-- Step 2: Drop the existing check constraint and widen column
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_amount_zar_check;
ALTER TABLE public.transactions
  ALTER COLUMN amount_zar       TYPE NUMERIC(18,6),
  ALTER COLUMN platform_fee_zar TYPE NUMERIC(18,6);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_amount_zar_check CHECK (amount_zar > 0::numeric);

-- Step 3: Recreate RPC function with NUMERIC(18,6)
CREATE OR REPLACE FUNCTION public.insert_transaction_serializable(
  p_creator_id UUID, p_customer_id UUID, p_amount_zar NUMERIC(18,6),
  p_platform_fee_zar NUMERIC(18,6), p_gateway TEXT, p_gateway_ref TEXT,
  p_external_id TEXT, p_status TEXT, p_type TEXT, p_source_type TEXT,
  p_community_impact BOOLEAN, p_emotion_state TEXT, p_is_cross_border BOOLEAN,
  p_source_currency TEXT, p_destination_currency TEXT, p_source_country TEXT,
  p_destination_country TEXT, p_metadata JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET default_transaction_isolation = 'serializable'
AS $$
DECLARE v_tx RECORD;
BEGIN
  INSERT INTO public.transactions (
    creator_id, customer_id, amount_zar, platform_fee_zar, gateway, gateway_ref,
    external_id, status, type, source_type, community_impact, emotion_state,
    is_cross_border, source_currency, destination_currency, source_country,
    destination_country, metadata
  ) VALUES (
    p_creator_id, p_customer_id, p_amount_zar, p_platform_fee_zar, p_gateway,
    p_gateway_ref, p_external_id, p_status, p_type, p_source_type,
    p_community_impact, p_emotion_state, p_is_cross_border, p_source_currency,
    p_destination_currency, p_source_country, p_destination_country, p_metadata
  ) RETURNING * INTO v_tx;
  RETURN jsonb_build_object('id', v_tx.id, 'creator_id', v_tx.creator_id,
    'amount_zar', v_tx.amount_zar, 'status', v_tx.status,
    'emotion_state', v_tx.emotion_state, 'created_at', v_tx.created_at);
EXCEPTION
  WHEN unique_violation      THEN RETURN jsonb_build_object('error','DUPLICATE','code','23505');
  WHEN serialization_failure THEN RETURN jsonb_build_object('error','SERIALIZATION_FAILURE','code','40001');
  WHEN OTHERS                THEN RETURN jsonb_build_object('error', SQLERRM, 'code', SQLSTATE);
END;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- Security: Revoke public access from SECURITY DEFINER functions
-- ══════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.insert_transaction_serializable(UUID, UUID, NUMERIC(18,6), NUMERIC(18,6), TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
