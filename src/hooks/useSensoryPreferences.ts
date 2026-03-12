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
  // Start with safe defaults (no localStorage access during SSR)
  const [audio, setAudio] = useState<boolean>(true);
  const [haptics, setHaptics] = useState<boolean>(true);
  const [motion, setMotion] = useState<boolean>(true);
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  // Load preferences from localStorage after mount (client-side only)
  useEffect(() => {
    setMounted(true);
    
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (stored) {
        if (typeof stored.audio === 'boolean') setAudio(stored.audio);
        if (typeof stored.haptics === 'boolean') setHaptics(stored.haptics);
        if (typeof stored.motion === 'boolean') setMotion(stored.motion);
      }
    } catch {
      // private browsing or corrupted data — ignore
    }

    // Check touch device
    setIsTouchDevice(
      window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
    );

    // Check reduced motion preference
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) setMotion(false);
  }, []);

  // Listen for OS motion-preference changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setMotion(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Persist preferences on change (only after mount)
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ audio, haptics, motion }));
    } catch {
      // private browsing — ignore
    }
  }, [audio, haptics, motion, mounted]);

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
