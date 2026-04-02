// src/components/sentient/MagneticReticle.tsx
"use client";

import { motion } from "framer-motion";
import { useMagneticCursor } from "@/hooks/useMagneticCursor";
import { useEmotionEngine, type EmotionState } from "@/hooks/useEmotionEngine";
import { useSensoryPreferences } from "@/hooks/useSensoryPreferences";

const RETICLE_VARS: Record<
  EmotionState,
  { scale: number; border: string; bg: string }
> = {
  dormant: { scale: 1, border: "rgba(255,255,255,0.2)", bg: "transparent" },
  awakened: {
    scale: 1.2,
    border: "rgba(16,185,129,0.5)",
    bg: "rgba(16,185,129,0.1)",
  },
  processing: {
    scale: 0.8,
    border: "rgba(139,92,246,0.8)",
    bg: "rgba(139,92,246,0.2)",
  },
  resolved: { scale: 1.5, border: "rgba(59,130,246,0.6)", bg: "transparent" },
};

export default function MagneticReticle() {
  const { x, y, isHovering } = useMagneticCursor();
  const { state } = useEmotionEngine();
  const { motion: motionEnabled, isTouchDevice } = useSensoryPreferences();

  if (isTouchDevice || !motionEnabled) return null;

  const style = RETICLE_VARS[state];

  return (
    <motion.div
      className="fixed top-0 left-0 w-8 h-8 rounded-full pointer-events-none z-[9999] mix-blend-difference flex items-center justify-center border-2"
      animate={{
        x: x - 16,
        y: y - 16,
        scale: isHovering ? style.scale * 1.5 : style.scale,
        borderColor: style.border,
        backgroundColor: style.bg,
        borderWidth: isHovering ? "1px" : "2px",
      }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 28,
        mass: 0.5,
      }}
    >
      {/* Inner precise dot */}
      <motion.div
        className="w-1 h-1 bg-white rounded-full"
        animate={{ opacity: isHovering ? 0 : 1 }}
      />
    </motion.div>
  );
}
