/**
 * ReducedMotionGate
 *
 * Wraps the Three.js canvas layer.  When the user has enabled "Reduce Motion"
 * in their OS accessibility settings this component returns a static gradient
 * fallback instead of rendering the Three.js tree — completely eliminating the
 * WebGL context, all animation frames, and the ~500 KB R3F bundle for those
 * users.
 *
 * WHY THIS MATTERS FOR APEX:
 * ─────────────────────────
 * Three.js + R3F initialisation occupies the main thread for 100–300 ms even
 * after the dynamic import resolves.  For users who explicitly requested no
 * motion this cost is entirely wasted.
 *
 * prefers-reduced-motion: reduce is active for roughly 15 % of mobile users
 * (accessibility need, vestibular disorder, or battery-saving mode).
 *
 * WCAG 2.3.3 Animation from Interactions (AAA): any animation lasting more
 * than 5 seconds must be stoppable by the user.  The EmotionalSwarm is
 * infinite.  This gate satisfies that requirement for users who have already
 * expressed their preference at the OS level.
 *
 * FIX — useSyncExternalStore:
 * ───────────────────────────
 * The previous useState + useEffect pattern caused two renders on mount:
 * first with false (SSR-safe default), then after the effect ran with the
 * actual matchMedia value.  This means reduced-motion users still triggered
 * the SentientCanvasScene dynamic import on the first client pass.
 *
 * useSyncExternalStore is the correct React pattern for external browser APIs:
 * - getServerSnapshot returns false → no SSR/hydration mismatch
 * - getSnapshot reads matchMedia synchronously → correct value on first paint
 * - subscribe wires the mql 'change' listener → real-time OS setting changes
 *
 * Result: zero double-render, no blank flash, Three.js never loads for
 * reduced-motion users even on the first client render.
 *
 * OS PATHS TO ENABLE:
 * ───────────────────
 * macOS   → System Settings → Accessibility → Display → Reduce Motion
 * iOS     → Settings → Accessibility → Motion → Reduce Motion
 * Android → Settings → Accessibility → Remove Animations
 * Windows → Settings → Accessibility → Visual Effects → Animation Effects
 *
 * @module components/sentient/ReducedMotionGate
 */
"use client";

import { useSyncExternalStore, type ReactNode } from "react";

interface ReducedMotionGateProps {
  /**
   * Children to render when motion is allowed (the Three.js canvas layer).
   */
  children: ReactNode;
  /**
   * Optional custom fallback for reduced-motion users.
   * Defaults to a static dark gradient matching the visual weight of the swarm.
   */
  fallback?: ReactNode;
}

/**
 * Subscribe function for useSyncExternalStore.
 * Wires a listener to the prefers-reduced-motion media query so React
 * re-renders whenever the OS setting changes while the page is open.
 */
function subscribe(onStoreChange: () => void): () => void {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

/**
 * getSnapshot — called on every render (client).
 * Returns the current value of the media query synchronously.
 */
function getSnapshot(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * getServerSnapshot — called during SSR and hydration.
 * Returns false (motion allowed) to avoid hydration mismatches.
 * All R3F components are already wrapped in dynamic({ ssr: false }),
 * so this path never actually renders Three.js on the server.
 */
function getServerSnapshot(): boolean {
  return false;
}

export function ReducedMotionGate({
  children,
  fallback,
}: ReducedMotionGateProps) {
  /**
   * useSyncExternalStore gives us the correct value synchronously on the
   * first client render — no double-render, no blank flash, no stale state.
   */
  const prefersReduced = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  if (prefersReduced) {
    return (
      <>
        {fallback ?? (
          /**
           * Static gradient fallback.
           * - Matches the dark-to-dark visual weight of the swarm container.
           * - Zero JavaScript execution after this render — no requestAnimationFrame,
           *   no WebGL context, no Three.js.
           * - aria-hidden: purely decorative background, same as the canvas.
           */
          <div
            className="absolute inset-0 bg-gradient-to-b from-neutral-950 via-neutral-900/60 to-neutral-950"
            aria-hidden="true"
          />
        )}
      </>
    );
  }

  // Motion is allowed — render children (the SentientCanvasScene dynamic import).
  return <>{children}</>;
}
