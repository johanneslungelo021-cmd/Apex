/**
 * GraphRAG Audit Trail — APEX Sentinel v3
 *
 * Builds and queries a knowledge graph of deployment decisions.
 * Provides multi-hop reasoning chains for explainability.
 *
 * Nodes: commits, deployments, incidents, agent_votes, fixes, transactions
 * Edges: caused_by, fixed_by, voted_on, triggered, resolved, approved_by
 */

export type NodeType =
  | "commit"
  | "deployment"
  | "incident"
  | "agent_vote"
  | "fix"
  | "transaction";
export type EdgeType =
  | "caused_by"
  | "fixed_by"
  | "voted_on"
  | "triggered"
  | "resolved"
  | "approved_by";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface GraphEdge {
  from_id: string;
  to_id: string;
  edge_type: EdgeType;
  weight: number; // 0-1 confidence
  metadata: Record<string, unknown>;
}

export interface AuditGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Build a reasoning chain from a decision node back to its root causes */
export function traceReasoningChain(
  graph: AuditGraph,
  decisionNodeId: string,
  maxDepth = 5,
): GraphNode[] {
  const visited = new Set<string>();
  const chain: GraphNode[] = [];

  function traverse(nodeId: string, depth: number): void {
    if (depth > maxDepth || visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    chain.push(node);

    // Follow edges backward (caused_by, triggered)
    const incomingEdges = graph.edges.filter(
      (e) =>
        e.to_id === nodeId &&
        ["caused_by", "triggered", "voted_on"].includes(e.edge_type),
    );

    for (const edge of incomingEdges) {
      traverse(edge.from_id, depth + 1);
    }
  }

  traverse(decisionNodeId, 0);
  return chain;
}

/** Create a new audit node for a deployment event */
export function createDeploymentNode(
  commitSha: string,
  status: "success" | "failure",
  metadata: Record<string, unknown>,
): GraphNode {
  return {
    id: `deploy_${commitSha.slice(0, 8)}_${Date.now()}`,
    type: "deployment",
    label: `Deploy ${commitSha.slice(0, 8)}: ${status}`,
    metadata: { commitSha, status, ...metadata },
    created_at: new Date().toISOString(),
  };
}

/** Create an audit node for an agent vote */
export function createAgentVoteNode(
  agentName: string,
  vote: "approve" | "reject",
  confidence: number,
  finding: string,
): GraphNode {
  return {
    id: `vote_${agentName}_${Date.now()}`,
    type: "agent_vote",
    label: `${agentName}: ${vote} (${Math.round(confidence * 100)}% confidence)`,
    metadata: { agentName, vote, confidence, finding },
    created_at: new Date().toISOString(),
  };
}
