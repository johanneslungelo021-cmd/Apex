// src/components/sentient/EmotionalGrid.tsx
"use client";

import { type ReactNode } from "react";
import { useEmotionEngine, type EmotionState } from "@/hooks/useEmotionEngine";

const GRID_VARS: Record<EmotionState, Record<string, string>> = {
  dormant: {
    "--apex-glow": "0 0 0px transparent",
    "--apex-border": "rgba(255,255,255,0.05)",
    "--apex-gap": "1.5rem",
  },
  awakened: {
    "--apex-glow": "0 0 40px rgba(16,185,129,0.08)",
    "--apex-border": "rgba(16,185,129,0.12)",
    "--apex-gap": "1.75rem",
  },
  processing: {
    "--apex-glow": "0 0 60px rgba(139,92,246,0.1)",
    "--apex-border": "rgba(139,92,246,0.1)",
    "--apex-gap": "2rem",
  },
  resolved: {
    "--apex-glow": "0 0 30px rgba(59,130,246,0.12)",
    "--apex-border": "rgba(59,130,246,0.15)",
    "--apex-gap": "1.25rem",
  },
};

export default function EmotionalGrid({ children }: { children: ReactNode }) {
  const { state } = useEmotionEngine();
  return (
    <div
      className="transition-all duration-700 ease-out"
      style={GRID_VARS[state] as React.CSSProperties}
    >
      {children}
    </div>
  );
}
