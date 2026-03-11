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
 * OS PATHS TO ENABLE:
 * ───────────────────
 * macOS   → System Settings → Accessibility → Display → Reduce Motion
 * iOS     → Settings → Accessibility → Motion → Reduce Motion
 * Android → Settings → Accessibility → Remove Animations
 * Windows → Settings → Accessibility → Visual Effects → Animation Effects
 *
 * @module components/sentient/ReducedMotionGate
 */
'use client';

import { useState, useEffect, type ReactNode } from 'react';

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

export function ReducedMotionGate({ children, fallback }: ReducedMotionGateProps) {
  /**
   * Start with false (motion allowed) to avoid an SSR/client hydration mismatch.
   * The useEffect below corrects the value immediately on the client after mount.
   * On the server this component always renders the children path — harmless
   * because Three.js components are all wrapped in `dynamic({ ssr: false })`.
   */
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(mql.matches);

    /**
     * Listen for OS-level changes in real time.
     * A user can toggle the setting while the page is open (e.g. enabling
     * Low Power Mode on iOS).  This handler ensures the canvas is unmounted
     * immediately when that happens.
     */
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReduced(event.matches);
    };

    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

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
