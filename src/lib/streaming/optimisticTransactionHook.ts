/**
 * optimisticTransactionHook.ts
 *
 * Lightweight module: hook + types only — no framer-motion, no Three.js, no heavy UI.
 * Imported statically by page.tsx so the hook is available on first render without
 * pulling TransactionBeam / StreamingTypography into the initial JS bundle.
 *
 * The heavy UI components (TransactionBeam, StreamingTypography, OptimisticTransactionCard)
 * remain in OptimisticTransactionUI.tsx which is dynamic-imported.
 */

import {
  useOptimisticTransaction,
  type TransactionIntent,
  type TransactionEvent,
} from "./OptimisticTransactionUI";

export {
  useOptimisticTransaction,
  type TransactionIntent,
  type TransactionEvent,
};

/**
 * OptimisticTransactionState — convenience type so callers can annotate
 * the `transactionState` slice of useOptimisticTransaction without importing
 * the full heavy UI module.
 *
 * Derived via ReturnType of the hook itself (no dynamic import() in type position,
 * which is forbidden under isolatedModules:true).
 */
export type OptimisticTransactionState = ReturnType<
  typeof useOptimisticTransaction
>["transactionState"];
