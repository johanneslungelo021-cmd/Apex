/**
 * yieldToMain — Break long tasks, improve INP
 *
 * INP (Interaction to Next Paint) = input delay + processing duration + presentation.
 * When the main thread is busy executing a long task (>50ms), any user interaction
 * must wait for that task to finish before its event handler can even BEGIN.
 *
 * This utility yields control back to the browser so it can process pending input
 * events (clicks, key presses, taps) before continuing the current work.
 *
 * Priority order:
 * 1. scheduler.yield() — Chrome 115+ (task inherits priority from initiating task)
 * 2. scheduler.postTask() — Chrome 94+ (explicit user-visible priority)
 * 3. MessageChannel — Safari/Firefox fallback (better than setTimeout(0))
 * 4. setTimeout(0) — last resort
 *
 * Usage:
 * ```typescript
 * import { yieldToMain } from '@/lib/performance/yieldToMain';
 *
 * for (const item of heavyList) {
 *   await processItem(item);
 *   await yieldToMain(); // Yield after each item so clicks can land
 * }
 * ```
 *
 * @see https://web.dev/articles/optimize-inp
 * @module lib/performance/yieldToMain
 */

type SchedulerYield = () => Promise<void>;

// The Scheduling API is not yet in lib.dom.d.ts — declare it here.
// https://wicg.github.io/scheduling-apis/
declare const scheduler: unknown;

/**
 * Returns a promise that resolves after yielding control to the browser's
 * task queue. Use inside async loops to break up long tasks.
 */
export function yieldToMain(): Promise<void> {
  // 1. scheduler.yield() — Chrome 115+. Inherits priority from calling task.
  // This is the gold standard: the browser resumes this coroutine at the same
  // priority as the original task, avoiding starvation.
  if (
    typeof scheduler !== 'undefined' &&
    typeof (scheduler as { yield?: SchedulerYield }).yield === 'function'
  ) {
    return (scheduler as { yield: SchedulerYield }).yield();
  }

  // 2. scheduler.postTask() — Chrome 94+. Explicit user-visible priority.
  if (
    typeof scheduler !== 'undefined' &&
    typeof (scheduler as { postTask?: (fn: () => void, opts: { priority: string }) => Promise<void> }).postTask === 'function'
  ) {
    return (scheduler as {
      postTask: (fn: () => void, opts: { priority: string }) => Promise<void>
    }).postTask(() => {}, { priority: 'user-visible' });
  }

  // 3. MessageChannel — Safari / Firefox. MessageChannel callbacks execute
  // before setTimeout callbacks in the task queue, making them more responsive.
  return new Promise<void>((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => resolve();
    port2.postMessage(null);
  });
}

/**
 * isLongTask — Check if a synchronous operation will constitute a "long task"
 * (>50ms). Use this to decide whether to break up work with yieldToMain().
 *
 * @param startTime performance.now() timestamp from before the work started
 * @returns true if >50ms has elapsed
 */
export function isLongTask(startTime: number): boolean {
  return performance.now() - startTime > 50;
}
