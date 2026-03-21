-- Increase precision of monetary columns to support sub-cent MPP micro-payments
ALTER TABLE public.transactions
  ALTER COLUMN amount_zar     TYPE NUMERIC(18,6),
  ALTER COLUMN platform_fee_zar TYPE NUMERIC(18,6);
