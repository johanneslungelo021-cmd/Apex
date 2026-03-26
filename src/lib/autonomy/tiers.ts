/**
 * T3 Collaborative Autonomy Framework — APEX Sentinel v3
 *
 * Autonomy tiers define the level of human oversight required for each operation.
 * Financial operations with real money ALWAYS require T3 (HITL) or above.
 *
 * T1 — Autonomous:      Risk < 0.2. Auto-execute. Log only.
 * T2 — Consensus:       Risk 0.2-0.5. Byzantine ⅔ vote required.
 * T3 — HITL:            Risk 0.5-0.8. Human approval required (treasury, KYC).
 * T4 — Full Override:   Risk > 0.8. Complete human control (rollback, key rotation).
 */

export type AutonomyTier = "T1" | "T2" | "T3" | "T4";

export interface OperationRisk {
  tier: AutonomyTier;
  riskScore: number; // 0.0 - 1.0
  requiresHITL: boolean;
  requiresByzantine: boolean;
  reason: string;
}

/** Risk factors that escalate autonomy tier */
const HIGH_RISK_PATTERNS = [
  "treasury",
  "withdrawal",
  "transfer",
  "private_key",
  "secret",
  "admin",
  "sudo",
  "root",
  "production",
  "rollback",
];

const MEDIUM_RISK_PATTERNS = [
  "deploy",
  "migration",
  "schema",
  "config",
  "payment",
  "wallet",
  "credential",
  "permission",
  "role",
];

export function classifyOperation(
  operation: string,
  context: {
    amountUsd?: number;
    isProduction?: boolean;
    affectsFinancials?: boolean;
  } = {},
): OperationRisk {
  const op = operation.toLowerCase();

  // T4: Real money movements > $100 or key rotation
  if (context.amountUsd && context.amountUsd > 100) {
    return {
      tier: "T4",
      riskScore: 0.9,
      requiresHITL: true,
      requiresByzantine: true,
      reason: `High-value financial operation ($${context.amountUsd})`,
    };
  }

  // T3: Any financial operation, KYC, auth changes
  if (
    HIGH_RISK_PATTERNS.some((p) => op.includes(p)) ||
    context.affectsFinancials
  ) {
    return {
      tier: "T3",
      riskScore: 0.7,
      requiresHITL: true,
      requiresByzantine: true,
      reason: `High-risk operation: ${operation}`,
    };
  }

  // T2: Deployments, migrations, config changes
  if (
    MEDIUM_RISK_PATTERNS.some((p) => op.includes(p)) ||
    context.isProduction
  ) {
    return {
      tier: "T2",
      riskScore: 0.4,
      requiresHITL: false,
      requiresByzantine: true,
      reason: `Medium-risk operation: ${operation}`,
    };
  }

  // T1: Everything else — auto-execute
  return {
    tier: "T1",
    riskScore: 0.1,
    requiresHITL: false,
    requiresByzantine: false,
    reason: "Low-risk operation — autonomous execution",
  };
}

/** HITL checkpoint — throws if human approval is required but not provided */
export function assertAuthorized(
  operation: string,
  options: {
    humanApprovalToken?: string;
    context?: Parameters<typeof classifyOperation>[1];
  } = {},
): OperationRisk {
  const risk = classifyOperation(operation, options.context);

  if (risk.requiresHITL && !options.humanApprovalToken) {
    throw new Error(
      `[T3 HITL REQUIRED] Operation "${operation}" requires explicit human approval. ` +
        `Risk score: ${risk.riskScore}. Tier: ${risk.tier}. Reason: ${risk.reason}`,
    );
  }

  return risk;
}
