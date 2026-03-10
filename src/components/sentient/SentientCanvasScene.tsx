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

export default function SentientCanvasScene() {
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
