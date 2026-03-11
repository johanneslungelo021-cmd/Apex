/**
 * SentientCanvasScene
 *
 * PURPOSE: Wraps <Canvas> + <EmotionalSwarm> behind a single default export
 * so that next/dynamic with ssr:false can cleanly isolate ALL Three.js code
 * (three, @react-three/fiber, @react-three/drei) from the critical JS bundle.
 *
 * PERFORMANCE CONTRACT:
 * - This file is NEVER included in the initial JS payload sent to the browser.
 * - It begins downloading only after the browser has painted the first frame (FCP).
 * - <canvas> is excluded from LCP measurement, so deferring this cannot harm LCP.
 *
 * @module components/sentient/SentientCanvasScene
 */
'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import EmotionalSwarm from '@/components/sentient/EmotionalSwarm';

/**
 * useIsLowBandwidth
 *
 * Returns true when the browser reports a constrained network connection via
 * the Network Information API (navigator.connection).  We skip the Three.js
 * canvas entirely on these connections: the swarm costs ~50 KB of JS plus a
 * full WebGL context — a meaningful penalty when SA 3G users pay per MB.
 *
 * Thresholds:
 *   saveData === true       → user has explicitly requested minimal data
 *   effectiveType '2g'      → ~50 kbps, latency > 300 ms
 *   effectiveType 'slow-2g' → < 50 kbps, not viable for canvas
 *
 * navigator.connection is not in lib.dom.d.ts — typed inline so TS doesn't
 * error.  Falls back to false (render canvas) on browsers without the API.
 */
function useIsLowBandwidth(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (!conn) return false;
  return !!(
    conn.saveData ||
    conn.effectiveType === '2g' ||
    conn.effectiveType === 'slow-2g'
  );
}

export default function SentientCanvasScene() {
  const isLowBandwidth = useIsLowBandwidth();

  /**
   * On 2G or save-data connections: return a static gradient.
   * The parent container (fixed, inset-0, -z-10) still occupies its space
   * so there is no layout shift.  Zero WebGL, zero JS animation cost.
   */
  if (isLowBandwidth) {
    return (
      <div
        className="absolute inset-0 bg-gradient-to-b from-neutral-950 via-neutral-900/80 to-neutral-950"
        aria-hidden="true"
      />
    );
  }

  return (
    /**
     * Suspense fallback is null — the parent container (fixed, inset-0, -z-10)
     * is already in the DOM so there is no layout shift. The canvas simply
     * appears as soon as WebGL initialises, which happens post-FCP.
     */
    <Suspense fallback={null}>
      <Canvas
        camera={{ position: [0, 0, 15], fov: 60 }}
        /**
         * Fix 8 (R3F performance): frameloop='demand' tells R3F to only render
         * frames when React state actually changes, rather than the default
         * 'always' mode which drives 60fps even when nothing moves.
         *
         * EmotionalSwarm uses useFrame() for continuous animation so it needs
         * 'always'. But for any future static scenes, use 'demand'.
         */
        frameloop="always"
        /**
         * dpr=[1, 1.5] caps pixel ratio at 1.5.
         * At dpr=2 (standard Retina), a 390px-wide phone renders a 780px canvas.
         * Capping at 1.5 gives a ~44% reduction in pixel fill while remaining
         * visually indistinguishable for a particle effect.
         */
        dpr={[1, 1.5]}
      >
        <EmotionalSwarm />
      </Canvas>
    </Suspense>
  );
}
