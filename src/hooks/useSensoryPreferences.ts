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

/**
 * Load initial value from localStorage (client-side only).
 * Returns the stored value or the default.
 */
function getStoredValue<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === typeof defaultValue) return parsed;
    }
  } catch {
    // private browsing or corrupted data — ignore
  }
  return defaultValue;
}

/**
 * Check if device is touch-capable (client-side only).
 */
function checkTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

export function useSensoryPreferences(): SensoryPrefs {
  // Use lazy initializers to read from localStorage on first client render
  // This avoids calling setState in useEffect
  const [audio, setAudio] = useState<boolean>(() => getStoredValue('apex-audio', true));
  const [haptics, setHaptics] = useState<boolean>(() => getStoredValue('apex-haptics', true));
  const [motion, setMotion] = useState<boolean>(() => {
    // Check reduced motion preference on init
    if (typeof window !== 'undefined') {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reducedMotion) return false;
    }
    return getStoredValue('apex-motion', true);
  });
  
  // Touch device status is static, compute once
  const isTouchDevice = useMemo(() => checkTouchDevice(), []);

  // Listen for OS motion-preference changes
  useEffect(() => {
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
