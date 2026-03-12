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
 * Read the combined preferences object from localStorage.
 * Written by the persistence useEffect as { audio, haptics, motion }.
 */
function getStoredPrefs(): { audio: boolean; haptics: boolean; motion: boolean } | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {
    // private browsing or corrupted data — ignore
  }
  return null;
}

/**
 * Check if device is touch-capable (client-side only).
 */
function checkTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

export function useSensoryPreferences(): SensoryPrefs {
  // Read from the same KEY that the persistence useEffect writes to.
  // Previously read from individual keys (apex-audio, apex-haptics) that
  // were never written — causing preferences to reset on every page load.
  const [audio, setAudio] = useState<boolean>(() => {
    const prefs = getStoredPrefs();
    return prefs?.audio ?? true;
  });

  const [haptics, setHaptics] = useState<boolean>(() => {
    const prefs = getStoredPrefs();
    return prefs?.haptics ?? true;
  });

  const [motion, setMotion] = useState<boolean>(() => {
    // Honour OS reduced-motion preference on first load
    if (typeof window !== 'undefined') {
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reducedMotion) return false;
    }
    const prefs = getStoredPrefs();
    return prefs?.motion ?? true;
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

  // Persist preferences to localStorage on every change
  // Writes to KEY = 'apex-sensory' as { audio, haptics, motion }
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
