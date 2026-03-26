-- Migration 014: RAG pipeline — ai_traces, agent_memory, warden_consensus, payment_routes

-- Enable pgvector extension for semantic memory
CREATE EXTENSION IF NOT EXISTS vector;

-- AI execution trace log (observability)
CREATE TABLE IF NOT EXISTS public.ai_traces (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task        TEXT        NOT NULL,
  query       TEXT,
  model       TEXT        NOT NULL,
  latency     INTEGER,
  tokens      INTEGER,
  success     BOOLEAN     NOT NULL DEFAULT false,
  score       FLOAT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_traces_model    ON public.ai_traces(model);
CREATE INDEX IF NOT EXISTS idx_ai_traces_created  ON public.ai_traces(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_traces_success  ON public.ai_traces(success);

-- Agent memory with pgvector embeddings for semantic retrieval
CREATE TABLE IF NOT EXISTS public.agent_memory (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT        NOT NULL CHECK (type IN ('win','loss','neutral')),
  content     TEXT        NOT NULL,
  score       FLOAT,
  embedding   vector(768),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_type     ON public.agent_memory(type);
CREATE INDEX IF NOT EXISTS idx_agent_memory_created  ON public.agent_memory(created_at DESC);

-- Byzantine/Warden consensus votes
CREATE TABLE IF NOT EXISTS public.warden_consensus (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id         UUID,
  warden_1_vote     BOOLEAN,
  warden_2_vote     BOOLEAN,
  warden_3_vote     BOOLEAN,
  consensus_reached BOOLEAN     GENERATED ALWAYS AS (
    (CASE WHEN warden_1_vote THEN 1 ELSE 0 END +
     CASE WHEN warden_2_vote THEN 1 ELSE 0 END +
     CASE WHEN warden_3_vote THEN 1 ELSE 0 END) >= 2
  ) STORED,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cross-chain payment routing log
CREATE TABLE IF NOT EXISTS public.payment_routes (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_amount        NUMERIC(38,8) NOT NULL,
  source_currency      VARCHAR(8)  DEFAULT 'USDC',
  destination_currency VARCHAR(8)  DEFAULT 'ZAR',
  xrpl_transaction     VARCHAR(128),
  payfast_payment_id   VARCHAR(64),
  exchange_rate        NUMERIC(38,8),
  fees                 NUMERIC(38,8),
  status               VARCHAR(32) DEFAULT 'pending',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_routes_status  ON public.payment_routes(status);
CREATE INDEX IF NOT EXISTS idx_payment_routes_created ON public.payment_routes(created_at DESC);

-- RPC: get similar win memories for a given task embedding
CREATE OR REPLACE FUNCTION public.get_similar_memories(
  query_embedding  vector(768),
  match_count      INT DEFAULT 5,
  match_threshold  FLOAT DEFAULT 0.0
)
RETURNS TABLE(id UUID, content TEXT, score FLOAT, similarity FLOAT)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT id, content, score,
    1 - (embedding <=> query_embedding) AS similarity
  FROM public.agent_memory
  WHERE type = 'win'
    AND embedding IS NOT NULL
    AND (1 - (embedding <=> query_embedding)) >= match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- RLS policies
ALTER TABLE public.ai_traces       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warden_consensus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_routes  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_traces_service"       ON public.ai_traces       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "agent_memory_service"    ON public.agent_memory    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "warden_consensus_service" ON public.warden_consensus FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "payment_routes_service"  ON public.payment_routes  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════
-- Security: Revoke public access from SECURITY DEFINER functions
-- ══════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.get_similar_memories(vector(768), INT, FLOAT) FROM PUBLIC;
