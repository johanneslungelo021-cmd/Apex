-- Migration 012: GraphRAG audit trail for APEX Sentinel v3

CREATE TABLE IF NOT EXISTS public.audit_graph_nodes (
  id           TEXT        PRIMARY KEY,
  node_type    TEXT        NOT NULL CHECK (node_type IN ('commit','deployment','incident','agent_vote','fix','transaction')),
  label        TEXT        NOT NULL,
  metadata     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_graph_edges (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id      TEXT        NOT NULL REFERENCES public.audit_graph_nodes(id),
  to_id        TEXT        NOT NULL REFERENCES public.audit_graph_nodes(id),
  edge_type    TEXT        NOT NULL CHECK (edge_type IN ('caused_by','fixed_by','voted_on','triggered','resolved','approved_by')),
  weight       NUMERIC(4,3) NOT NULL DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 1),
  metadata     JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_nodes_type      ON public.audit_graph_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_audit_nodes_created   ON public.audit_graph_nodes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_edges_from      ON public.audit_graph_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_audit_edges_to        ON public.audit_graph_edges(to_id);
CREATE INDEX IF NOT EXISTS idx_audit_edges_type      ON public.audit_graph_edges(edge_type);

ALTER TABLE public.audit_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_graph_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_nodes_service_all" ON public.audit_graph_nodes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "audit_edges_service_all" ON public.audit_graph_edges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.audit_graph_nodes IS 'APEX Sentinel v3 GraphRAG: Knowledge graph nodes for deployment decisions and agent votes';
COMMENT ON TABLE public.audit_graph_edges IS 'APEX Sentinel v3 GraphRAG: Relationships between deployment events for multi-hop reasoning';
