export const runtime = 'nodejs';
/**
 * GraphRAG Explain Endpoint — APEX Sentinel v3
 * Returns the reasoning chain for a deployment decision.
 * GET /api/sentinel/explain?node_id=<id>
 */
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { traceReasoningChain, type AuditGraph } from '@/lib/graphrag/audit-graph';

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const nodeId = searchParams.get('node_id');
  if (!nodeId) return NextResponse.json({ error: 'node_id required' }, { status: 400 });

  const supabase = getSupabaseClient();
  const [nodesResult, edgesResult] = await Promise.all([
    supabase.from('audit_graph_nodes').select('*'),
    supabase.from('audit_graph_edges').select('*'),
  ]);

  if (nodesResult.error) return NextResponse.json({ error: 'Graph query failed' }, { status: 500 });

  const graph: AuditGraph = {
    nodes: nodesResult.data ?? [],
    edges: edgesResult.data ?? [],
  };

  const chain = traceReasoningChain(graph, nodeId);
  return NextResponse.json({ node_id: nodeId, reasoning_chain: chain, chain_length: chain.length });
};
