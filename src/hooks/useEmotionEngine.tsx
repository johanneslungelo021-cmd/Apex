// src/hooks/useEmotionEngine.ts
'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react';

export type EmotionState = 'dormant' | 'awakened' | 'processing' | 'resolved';

export interface EmotionApi {
  state: EmotionState;
  previous: EmotionState | null;
  intensity: number;
  transition: (to: EmotionState) => void;
  /** Run full cycle: awakened → processing → resolved → dormant */
  runCycle: (processingMs?: number) => void;
  isCycleActive: boolean;
  /** Elapsed ms in current state */
  stateAge: () => number;
  /** Legacy compat: triggers haptic + audio pulse like old triggerSentient */
  pulse: (intensity?: number) => void;
}

const EmotionContext = createContext<EmotionApi | null>(null);

export function EmotionProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<EmotionState>('dormant');
  const [previous, setPrevious] = useState<EmotionState | null>(null);
  const [intensity, setIntensity] = useState(1);
  const [isCycleActive, setIsCycleActive] = useState(false);
  const enteredAt = useRef<number>(0);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Initialize enteredAt after mount (avoids calling Date.now during render)
  useEffect(() => {
    enteredAt.current = Date.now();
  }, []);

  const transition = useCallback((to: EmotionState) => {
    setStateRaw((cur) => {
      if (cur === to) return cur;
      setPrevious(cur);
      enteredAt.current = Date.now();
      return to;
    });
  }, []);

  const runCycle = useCallback(
    (processingMs = 3000) => {
      timeouts.current.forEach(clearTimeout);
      timeouts.current = [];
      setIsCycleActive(true);

      transition('awakened');
      setIntensity(1.2);

      const t1 = setTimeout(() => {
        transition('processing');
        setIntensity(1.5);
      }, 500);

      const t2 = setTimeout(() => {
        transition('resolved');
        setIntensity(0.8);
      }, 500 + processingMs);

      const t3 = setTimeout(() => {
        transition('dormant');
        setIntensity(1);
        setIsCycleActive(false);
      }, 500 + processingMs + 1500);

      timeouts.current = [t1, t2, t3];
    },
    [transition]
  );

  const pulse = useCallback((pulseIntensity = 1) => {
    setIntensity(1 + pulseIntensity * 0.3);
    setTimeout(() => setIntensity(1), 300);
  }, []);

  const stateAge = useCallback(() => Date.now() - enteredAt.current, []);

  useEffect(() => {
    return () => timeouts.current.forEach(clearTimeout);
  }, []);

  const api = useMemo<EmotionApi>(
    () => ({
      state,
      previous,
      intensity,
      transition,
      runCycle,
      isCycleActive,
      stateAge,
      pulse,
    }),
    [state, previous, intensity, transition, runCycle, isCycleActive, stateAge, pulse]
  );

  return <EmotionContext.Provider value={api}>{children}</EmotionContext.Provider>;
}

export function useEmotionEngine(): EmotionApi {
  const ctx = useContext(EmotionContext);
  if (!ctx) throw new Error('useEmotionEngine requires <EmotionProvider>');
  return ctx;
}
