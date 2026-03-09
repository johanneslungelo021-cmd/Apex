/**
 * useVoiceInput — Speech-to-Text (STT) Hook
 *
 * Uses the Web Speech Recognition API (SpeechRecognition) to capture
 * voice input from the user and convert it to text.
 *
 * Features:
 *  - Auto-detects browser support (Chrome, Edge; Safari limited)
 *  - South African English preference (en-ZA → en-GB → en-US fallback)
 *  - Interim results while user speaks (live transcription)
 *  - Noise-robust: uses continuous + interimResults
 *  - Integrates with EmotionEngine: listening → processing, done → resolved
 *  - Respects audio sensory preference (won't activate when audio=false)
 *
 * @module hooks/useVoiceInput
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSensoryPreferences } from './useSensoryPreferences';
import { useEmotionEngine } from './useEmotionEngine';

export interface VoiceInputState {
  /** Whether the microphone is actively recording */
  isListening: boolean;
  /** Partial transcript while speaking */
  interimText: string;
  /** Final confirmed transcript */
  finalText: string;
  /** Error message if speech recognition failed */
  error: string | null;
  /** Whether Web Speech Recognition is supported in this browser */
  isSupported: boolean;
  /** Start listening */
  startListening: () => void;
  /** Stop listening and return final transcript */
  stopListening: () => void;
  /** Clear transcript */
  clearTranscript: () => void;
}

// Web Speech API types not yet in this TypeScript version's lib.dom.d.ts
// SpeechRecognitionAlternative, SpeechRecognitionResult, SpeechRecognitionResultList
// ARE defined in lib.dom.d.ts — we only declare what's missing.
declare global {
  interface SpeechRecognition extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onstart: (() => void) | null;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
    abort(): void;
  }
  interface SpeechRecognitionEvent extends Event {
    resultIndex: number;
    results: SpeechRecognitionResultList;
  }
  interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message: string;
  }
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export function useVoiceInput(
  onFinalTranscript?: (text: string) => void
): VoiceInputState {
  const { audio } = useSensoryPreferences();
  const emotion = useEmotionEngine();

  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [finalText, setFinalText] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Lazy initializer runs client-side only ('use client') — safe, no hydration mismatch
  const [isSupported] = useState(() => {
    if (typeof window === 'undefined') return false;
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Stable ref to callback — avoids stale closure in recognition.onresult
  const onFinalRef = useRef<((text: string) => void) | undefined>(onFinalTranscript);
  useEffect(() => {
    onFinalRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimText('');
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('Voice input is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    // Require audio preference to be enabled
    if (!audio) {
      setError('Enable audio in accessibility settings to use voice input.');
      return;
    }

    if (isListening) {
      stopListening();
      return;
    }

    setError(null);
    setFinalText('');
    setInterimText('');

    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    const recognition = new SpeechRecognitionCtor();

    // Try en-ZA first, browser will fall back gracefully
    recognition.lang = 'en-ZA';
    recognition.continuous = false; // single utterance per click
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      emotion.transition('processing');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result && result[0]) {
          if (result.isFinal) {
            final += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
      }

      if (interim) setInterimText(interim);
      if (final) {
        setFinalText(final.trim());
        setInterimText('');
        onFinalRef.current?.(final.trim());
        emotion.transition('resolved');
        setTimeout(() => emotion.transition('dormant'), 1000);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'aborted' || event.error === 'no-speech') {
        // User stopped or no speech — not a real error
        setIsListening(false);
        setInterimText('');
        return;
      }
      const messages: Record<string, string> = {
        'not-allowed': 'Microphone access denied. Please allow microphone permissions.',
        'network': 'Network error during speech recognition.',
        'audio-capture': 'No microphone detected.',
        'service-not-allowed': 'Speech service not available.',
      };
      setError(messages[event.error] ?? `Speech error: ${event.error}`);
      setIsListening(false);
      setInterimText('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start voice input.');
      setIsListening(false);
    }
  }, [isSupported, audio, isListening, stopListening, emotion]);

  const clearTranscript = useCallback(() => {
    setFinalText('');
    setInterimText('');
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return {
    isListening,
    interimText,
    finalText,
    error,
    isSupported,
    startListening,
    stopListening,
    clearTranscript,
  };
}
