// src/components/sentient/EmotionalSwarm.tsx
"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";
import { useEmotionEngine, type EmotionState } from "@/hooks/useEmotionEngine";

const SWARM_CONFIG: Record<
  EmotionState,
  {
    speed: number;
    spread: number;
    size: number;
    opacity: number;
    color: string;
  }
> = {
  dormant: {
    speed: 0.015,
    spread: 20,
    size: 0.015,
    opacity: 0.25,
    color: "#ffffff",
  },
  awakened: {
    speed: 0.04,
    spread: 18,
    size: 0.022,
    opacity: 0.5,
    color: "#10b981",
  },
  processing: {
    speed: 0.12,
    spread: 25,
    size: 0.035,
    opacity: 0.8,
    color: "#8b5cf6",
  },
  resolved: {
    speed: 0.005,
    spread: 15,
    size: 0.018,
    opacity: 0.6,
    color: "#3b82f6",
  },
};

export default function EmotionalSwarm() {
  const { state, intensity } = useEmotionEngine();
  const ref = useRef<THREE.Points>(null!);
  const matRef = useRef<THREE.PointsMaterial>(null!);
  const count = 2500;

  // Seeded deterministic positions — same approach as existing SwarmBackground
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (rand() - 0.5) * 20;
      arr[i * 3 + 1] = (rand() - 0.5) * 20;
      arr[i * 3 + 2] = (rand() - 0.5) * 20;
    }
    return arr;
  }, []);

  // Live refs for smooth lerping
  const currentSpeed = useRef(0.015);
  const currentOpacity = useRef(0.25);
  const targetColor = useRef(new THREE.Color("#ffffff"));
  const currentColor = useRef(new THREE.Color("#ffffff"));

  useFrame(({ clock }) => {
    if (!ref.current || !matRef.current) return;
    const t = clock.elapsedTime;
    const config = SWARM_CONFIG[state];

    // Smooth speed lerp
    currentSpeed.current +=
      (config.speed * intensity - currentSpeed.current) * 0.04;
    ref.current.rotation.x = t * currentSpeed.current;
    ref.current.rotation.y = t * currentSpeed.current * 1.3;

    // Processing jitter
    if (state === "processing") {
      ref.current.rotation.z = Math.sin(t * 4) * 0.02 * intensity;
    } else {
      ref.current.rotation.z *= 0.95;
    }

    // Smooth opacity
    currentOpacity.current += (config.opacity - currentOpacity.current) * 0.05;
    matRef.current.opacity = currentOpacity.current;

    // Smooth size
    matRef.current.size = THREE.MathUtils.lerp(
      matRef.current.size,
      config.size * intensity,
      0.05,
    );

    // Smooth color lerp
    targetColor.current.set(config.color);
    currentColor.current.lerp(targetColor.current, 0.03);
    matRef.current.color.copy(currentColor.current);
  });

  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        ref={matRef}
        transparent
        color="#ffffff"
        size={0.015}
        sizeAttenuation
        depthWrite={false}
        opacity={0.25}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}
