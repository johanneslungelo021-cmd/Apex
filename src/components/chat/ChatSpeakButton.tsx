/**
 * ChatSpeakButton
 *
 * Per-message TTS control rendered next to each assistant chat bubble.
 * Uses the useSpeech hook (browser Web Speech API → HF TTS fallback).
 *
 * Visual states:
 *  - idle: volume icon (muted appearance)
 *  - loading: spinner
 *  - speaking: animated waveform + stop icon
 *  - error: red alert icon (auto-clears after 3 seconds)
 *
 * Integrates with EmotionEngine via useSpeech — speaking triggers
 * 'processing' state, done → 'resolved'.
 *
 * @module components/chat/ChatSpeakButton
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpeech } from '@/hooks/useSpeech';

interface ChatSpeakButtonProps {
  text: string;
  /** Use HuggingFace high-quality TTS instead of browser synthesis */
  preferHQ?: boolean;
}

// Animated waveform bars
function Waveform() {
  return (
    <span className="flex items-end gap-px h-3" aria-hidden>
      {[0.5, 1, 0.7, 1, 0.6].map((h, i) => (
        <motion.span
          key={i}
          className="w-px bg-emerald-400 rounded-sm inline-block"
          animate={{ scaleY: [h, 1, h * 0.7, 1, h] }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.1,
            ease: 'easeInOut',
          }}
          style={{ height: `${h * 12}px`, transformOrigin: 'bottom' }}
        />
      ))}</span>
  );
}

export default function ChatSpeakButton({ text, preferHQ = false }: ChatSpeakButtonProps) {
  const { speak, stop, isSpeaking, isLoading, error, isAvailable } = useSpeech();

  const [showError, setShowError] = useState(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHideError = useCallback(() => {
    errorTimerRef.current = setTimeout(() => {
      setShowError(false);
      errorTimerRef.current = null;
    }, 3000);
  }, []);

  // React to error changes — defer setState via queueMicrotask to avoid
  // synchronous setState-in-effect (cascading renders lint rule).
  useEffect(() => {
    if (error !== null) {
      if (errorTimerRef.current !== null) {
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
      queueMicrotask(() => setShowError(true));
      scheduleHideError();
    } else {
      queueMicrotask(() => setShowError(false));
    }
  }, [error, scheduleHideError]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (errorTimerRef.current !== null) clearTimeout(errorTimerRef.current);
    };
  }, []);

  if (!isAvailable) return null;

  const handleClick = () => {
    if (isSpeaking) {
      stop();
    } else {
      void speak(text, preferHQ);
    }
  };

  return (
    <div className="relative inline-flex items-center">
      <motion.button
        onClick={handleClick}
        title={isSpeaking ? 'Stop speaking' : 'Read aloud'}
        aria-label={isSpeaking ? 'Stop reading aloud' : 'Read this message aloud'}
        aria-pressed={isSpeaking}
        className="p-1 rounded-lg hover:bg-white/10 transition opacity-40 hover:opacity-100 focus:opacity-100"
        whileTap={{ scale: 0.9 }}
      >
        {isLoading ? (
          <motion.span
            className="block w-3.5 h-3.5 border border-zinc-400 border-t-white rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          />
        ) : isSpeaking ? (
          <Waveform />
        ) : showError ? (
          <span className="text-red-400 text-xs">✕</span>
        ) : (
          <svg
            className="w-3.5 h-3.5 text-zinc-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </motion.button>

      <AnimatePresence>
        {showError && error && (
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-6 top-0 z-50 bg-zinc-900 border border-red-500/30 text-red-400 text-xs px-2 py-1 rounded-lg whitespace-nowrap shadow-lg"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
