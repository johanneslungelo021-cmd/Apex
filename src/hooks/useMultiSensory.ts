// src/hooks/useMultiSensory.ts
'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { EmotionState } from './useEmotionEngine';
import { useSensoryPreferences } from './useSensoryPreferences';

export function useMultiSensory() {
  const prefs = useSensoryPreferences();
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const activeRef = useRef<AudioNode[]>([]);
  const vibTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getCtx = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (ctxRef.current) return ctxRef.current;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC({ latencyHint: 'interactive' });
      masterRef.current = ctxRef.current.createGain();
      masterRef.current.gain.setValueAtTime(0.35, ctxRef.current.currentTime);
      masterRef.current.connect(ctxRef.current.destination);
      return ctxRef.current;
    } catch {
      return null;
    }
  }, []);

  const resume = useCallback(async () => {
    const ctx = getCtx();
    if (ctx?.state === 'suspended') await ctx.resume().catch(() => {});
  }, [getCtx]);

  // Auto-resume AudioContext on first user interaction
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const h = () => {
      void resume();
      window.removeEventListener('click', h);
      window.removeEventListener('touchend', h);
    };
    window.addEventListener('click', h);
    window.addEventListener('touchend', h);
    return () => {
      window.removeEventListener('click', h);
      window.removeEventListener('touchend', h);
    };
  }, [resume]);

  const stopAll = useCallback(() => {
    activeRef.current.forEach((n) => {
      try {
        if (n instanceof OscillatorNode) n.stop();
        n.disconnect();
      } catch {
        // already stopped
      }
    });
    activeRef.current = [];
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {
        // vibrate not available
      }
    }
    if (vibTimerRef.current !== null) {
      clearInterval(vibTimerRef.current);
      vibTimerRef.current = null;
    }
  }, []);

  const vibrate = useCallback(
    (p: number | number[]) => {
      if (!prefs.haptics || typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
      try {
        navigator.vibrate(p);
      } catch {
        // vibrate unavailable
      }
    },
    [prefs.haptics]
  );

  const trigger = useCallback(
    (emotionState: EmotionState) => {
      stopAll();

      if (emotionState === 'dormant') return;

      const ctx = getCtx();
      const canPlay = prefs.audio && ctx && ctx.state === 'running';

      if (emotionState === 'awakened') {
        if (canPlay && ctx && masterRef.current) {
          const now = ctx.currentTime;
          const osc = new OscillatorNode(ctx, { type: 'sine', frequency: 1800 });
          const gain = new GainNode(ctx);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.setValueAtTime(0.25, now + 0.001);
          gain.gain.setTargetAtTime(0.0001, now + 0.001, 0.02);
          osc.connect(gain);
          gain.connect(masterRef.current);
          osc.start(now);
          osc.stop(now + 0.1);
          activeRef.current.push(osc, gain);
        }
        vibrate(25);
      }

      if (emotionState === 'processing') {
        if (canPlay && ctx && masterRef.current) {
          const now = ctx.currentTime;
          const osc = new OscillatorNode(ctx, { type: 'sine', frequency: 40 });
          const gain = new GainNode(ctx);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.setTargetAtTime(0.35, now, 0.05);
          osc.connect(gain);
          gain.connect(masterRef.current);
          osc.start(now);
          activeRef.current.push(osc, gain);
        }
        vibrate([30, 100, 30]);
        vibTimerRef.current = setInterval(() => vibrate([30, 100, 30]), 460);
      }

      if (emotionState === 'resolved') {
        if (canPlay && ctx && masterRef.current) {
          const now = ctx.currentTime;
          [261.63, 329.63, 392.0].forEach((freq) => {
            const osc = new OscillatorNode(ctx!, { type: 'sine', frequency: freq });
            const gain = new GainNode(ctx!);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.setValueAtTime(0.2, now + 0.002);
            gain.gain.setTargetAtTime(0.0001, now + 0.002, 0.4);
            osc.connect(gain);
            gain.connect(masterRef.current!);
            osc.start(now);
            osc.stop(now + 2.0);
            activeRef.current.push(osc, gain);
          });
        }
        vibrate(50);
      }
    },
    [stopAll, getCtx, vibrate, prefs.audio]
  );

  useEffect(
    () => () => {
      stopAll();
      ctxRef.current?.close();
    },
    [stopAll]
  );

  return { trigger, resume };
}
