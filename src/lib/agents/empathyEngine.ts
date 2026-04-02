/**
 * Empathy Engine — Apex Central Error Humanization
 *
 * Transforms raw system errors into Ubuntu-grounded, empathetic responses.
 *
 * Architecture (never changes):
 * 1. Acknowledge the weight of the situation (never minimize)
 * 2. Explain what happened in plain language (never jargon)
 * 3. Confirm what's SAFE (funds, data, progress)
 * 4. Offer concrete next steps (never leave them hanging)
 * 5. End with agency — let them choose the path forward
 *
 * Design principles:
 * - Never blame the user
 * - Preserve user input always
 * - No humor in error states (becomes stale on repeated encounters)
 * - Persistent messages over toasts (toasts disappear before users finish reading)
 * - Hick's Law: max 3 action choices per error (fewer = faster decisions)
 */

import { empathyErrorCounter } from "../observability/pillar4Metrics";

export interface ApexError {
  code: string;
  severity: "low" | "medium" | "high" | "critical";
  technicalMessage: string;
  userContext?: {
    wasTransactionInvolved: boolean;
    userInputPreserved: boolean;
    isRetryable: boolean;
    estimatedRecoveryTime?: string;
  };
}

export interface SuggestedAction {
  label: string;
  action: string;
}

export interface HumanizedError {
  coreMessage: string;
  technicalDetails: string;
  wisdomNote?: {
    concept: string;
    explanation: string;
  };
  emotionContext: "cautionary" | "encouraging";
  suggestedActions: SuggestedAction[];
}

/**
 * Maps known XRPL and system error codes to empathetic, plain-language responses.
 * Falls through to a generic handler for unknown codes.
 */
export function humanizeError(error: ApexError): HumanizedError {
  const ts = new Date().toISOString();
  const recovery = error.userContext?.estimatedRecoveryTime ?? "30 seconds";
  const inputSafe = error.userContext?.userInputPreserved ?? true;

  const handlers: Record<string, () => HumanizedError> = {
    tecPATH_DRY: () => ({
      coreMessage:
        `The network couldn't find a clear path for your transaction right now — like a road temporarily blocked. ` +
        `Your funds haven't moved. They're exactly where you left them.`,
      technicalDetails:
        `XRPL Response: tecPATH_DRY\n` +
        `Meaning: Insufficient liquidity on the payment path between source and destination currencies.\n` +
        `Timestamp: ${ts}\n` +
        `Funds status: SAFE — no debit occurred.`,
      wisdomNote: {
        concept: "Payment Paths",
        explanation:
          `XRPL transactions travel through "paths" of connected currencies, like water finding routes ` +
          `through a river delta. When one path runs dry, we wait for liquidity to shift — which usually ` +
          `happens within seconds to minutes. This is the network protecting you from a bad exchange rate.`,
      },
      emotionContext: "cautionary",
      suggestedActions: [
        { label: "Retry in 30 seconds", action: "retry_delayed" },
        { label: "Adjust slippage tolerance", action: "adjust_slippage" },
        { label: "Alert me when the path clears", action: "monitor_path" },
      ],
    }),

    tecINSUF_FEE: () => ({
      coreMessage:
        `Your account doesn't have quite enough XRP to cover the network fee right now. ` +
        `Nothing was sent — your funds are SAFE and your balance is exactly as you left it.`,
      technicalDetails:
        `XRPL Response: tecINSUF_FEE\n` +
        `Meaning: Account reserve requirement not met after fee deduction.\n` +
        `Timestamp: ${ts}\n` +
        `Funds status: SAFE — no debit occurred.`,
      wisdomNote: {
        concept: "XRP Reserve",
        explanation:
          `The XRPL requires every account to hold a small XRP reserve (currently 10 XRP base reserve + ` +
          `2 XRP per additional object). This protects the network from spam. Think of it as the minimum ` +
          `balance your account needs to stay open — like a bank's minimum balance requirement, but on-chain.`,
      },
      emotionContext: "cautionary",
      suggestedActions: [
        { label: "Add more XRP to your account", action: "add_funds" },
        {
          label: "Check current reserve requirements",
          action: "check_reserves",
        },
      ],
    }),

    NETWORK_TIMEOUT: () => ({
      coreMessage:
        `The connection timed out — the network is taking longer than expected to respond. ` +
        `This usually resolves on its own. Nothing was lost.`,
      technicalDetails:
        `Error: NETWORK_TIMEOUT\n` +
        `Details: ${error.technicalMessage}\n` +
        `Timeout threshold: 30s\n` +
        `Timestamp: ${ts}\n` +
        `Retry recommended: Yes`,
      wisdomNote: {
        concept: "Network Resilience",
        explanation:
          `Decentralized networks don't have a single point of failure, but they can experience congestion — ` +
          `like rush hour traffic. The system queues your request rather than dropping it. ` +
          `Patience is built into the architecture.`,
      },
      emotionContext: "cautionary",
      suggestedActions: [
        { label: "Retry now", action: "retry_immediate" },
        { label: "Check network status", action: "check_status" },
      ],
    }),

    AI_GENERATION_FAILED: () => ({
      coreMessage:
        `I wasn't able to generate a response for that one. That's on me, not you. ` +
        `Let me try a different approach.`,
      technicalDetails:
        `Model: ${error.technicalMessage}\n` +
        `Error: Generation failed\n` +
        `Timestamp: ${ts}\n` +
        `Fallback: Attempting alternate model route`,
      emotionContext: "encouraging",
      suggestedActions: [
        { label: "Try again", action: "retry_generation" },
        { label: "Rephrase my question", action: "rephrase_prompt" },
        { label: "Talk to a human", action: "escalate_human" },
      ],
    }),

    RATE_LIMITED: () => ({
      coreMessage:
        `You're moving fast — I need a moment to catch up. The system is processing your previous requests. ` +
        `Give me ${recovery} and we'll be right back on track.`,
      technicalDetails:
        `Error: 429 Rate Limited\n` +
        `Details: ${error.technicalMessage}\n` +
        `Timestamp: ${ts}`,
      emotionContext: "encouraging",
      suggestedActions: [
        { label: `Wait ${recovery} and retry`, action: "retry_delayed" },
      ],
    }),

    SCOUT_EMPTY: () => ({
      coreMessage:
        `The Scout Agent came back empty-handed on this one. ` +
        `That's not a reflection of what's available — it means we need to refine the search.` +
        (inputSafe ? " Your query is saved." : ""),
      technicalDetails:
        `Error: SCOUT_EMPTY\n` +
        `Details: Scout returned 0 verified opportunities\n` +
        `Timestamp: ${ts}`,
      emotionContext: "encouraging",
      suggestedActions: [
        { label: "Search with different terms", action: "refine_search" },
        { label: "Browse all categories", action: "browse_categories" },
      ],
    }),

    PERPLEXITY_UNAVAILABLE: () => ({
      coreMessage:
        `The live web search is temporarily unavailable. I'm working from my last cached data, ` +
        `which may be a few minutes old. Core features are still fully operational.`,
      technicalDetails:
        `Error: PERPLEXITY_UNAVAILABLE\n` +
        `Details: ${error.technicalMessage}\n` +
        `Timestamp: ${ts}\n` +
        `Fallback: Using cached data`,
      emotionContext: "cautionary",
      suggestedActions: [
        { label: "Try again in a minute", action: "retry_delayed" },
        { label: "Continue with cached data", action: "use_cache" },
      ],
    }),

    DEFAULT: () => ({
      coreMessage:
        `Something unexpected happened. I'm looking into it. ` +
        (inputSafe ? "Your input is saved — nothing was lost." : ""),
      technicalDetails:
        `Error Code: ${error.code}\n` +
        `Details: ${error.technicalMessage}\n` +
        `Severity: ${error.severity}\n` +
        `Timestamp: ${ts}`,
      emotionContext: "cautionary",
      suggestedActions: [
        { label: "Try again", action: "retry_immediate" },
        { label: "Report this issue", action: "report_error" },
      ],
    }),
  };

  const safeCode = error.code in handlers ? error.code : "DEFAULT";
  const humanized = handlers[safeCode]();

  // Pillar 4: emit error humanization metric
  empathyErrorCounter.add(1, {
    error_code: safeCode,
    severity: error.severity,
  });

  return humanized;
}

/**
 * Returns a severity-appropriate display color class string.
 * Used by UI components to visually signal error weight.
 */
export function severityToColorClass(severity: ApexError["severity"]): string {
  return {
    low: "border-zinc-500/30 bg-zinc-500/5",
    medium: "border-amber-500/30 bg-amber-500/5",
    high: "border-orange-500/30 bg-orange-500/5",
    critical: "border-red-500/30 bg-red-500/5",
  }[severity];
}
