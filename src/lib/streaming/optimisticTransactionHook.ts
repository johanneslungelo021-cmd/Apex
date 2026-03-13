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

export {
  useOptimisticTransaction,
  type TransactionIntent,
  type TransactionEvent,
} from './OptimisticTransactionUI';

/**
 * OptimisticTransactionState — convenience re-export so callers can type
 * the return value of useOptimisticTransaction without importing the full UI module.
 */
export type OptimisticTransactionState = ReturnType<
  typeof import('./OptimisticTransactionUI').useOptimisticTransaction
>['transactionState'];
