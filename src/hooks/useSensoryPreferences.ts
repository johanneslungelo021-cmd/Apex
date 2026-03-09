// src/hooks/useSensoryPreferences.ts
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

export interface SensoryPrefs {
  audio: boolean;
  haptics: boolean;
  motion: boolean;
  isTouchDevice: boolean;
  toggle: (channel: 'audio' | 'haptics' | 'motion') => void;
}

const KEY = 'apex-sensory';

export function useSensoryPreferences(): SensoryPrefs {
  // All initial values derived via lazy initializers — no setState calls in effects
  const [audio, setAudio] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
      return stored?.audio ?? true;
    } catch { return true; }
  });

  const [haptics, setHaptics] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
      return stored?.haptics ?? true;
    } catch { return true; }
  });

  const [motion, setMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return false;
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
      return stored?.motion ?? true;
    } catch { return true; }
  });

  const isTouchDevice = useMemo<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Only responsibility: react to OS motion-preference changes at runtime
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setMotion(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Persist preferences on change
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ audio, haptics, motion }));
    } catch {
      // private browsing — ignore
    }
  }, [audio, haptics, motion]);

  const toggle = useCallback((ch: 'audio' | 'haptics' | 'motion') => {
    if (ch === 'audio') setAudio((v) => !v);
    if (ch === 'haptics') setHaptics((v) => !v);
    if (ch === 'motion') setMotion((v) => !v);
  }, []);

  return useMemo(
    () => ({ audio, haptics, motion, isTouchDevice, toggle }),
    [audio, haptics, motion, isTouchDevice, toggle]
  );
}
