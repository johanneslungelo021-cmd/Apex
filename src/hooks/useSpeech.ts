/**
 * useSpeech — Text-to-Speech Hook
 *
 * Two-tier TTS strategy:
 *  1. Browser Web Speech API (SpeechSynthesis) — zero latency, zero cost,
 *     works offline, uses system voice. Preferred.
 *  2. HuggingFace TTS API via /api/tts — higher quality, requires network.
 *     Used when Web Speech is unavailable or user requests HQ audio.
 *
 * Integrates with EmotionEngine:
 *  - Speaking → triggers 'processing' emotion state
 *  - Done speaking → triggers 'resolved' emotion state
 *
 * Integrates with SensoryPreferences:
 *  - Respects audio: false toggle (never speaks when audio is disabled)
 *
 * @module hooks/useSpeech
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSensoryPreferences } from "./useSensoryPreferences";
import { useEmotionEngine } from "./useEmotionEngine";

export type SpeechMode = "browser" | "hf" | "unavailable";

export interface SpeechState {
  isSpeaking: boolean;
  isLoading: boolean;
  mode: SpeechMode;
  error: string | null;
  /** Speak a text string */
  speak: (text: string, useHQ?: boolean) => Promise<void>;
  /** Stop current speech immediately */
  stop: () => void;
  /** Whether TTS is available at all */
  isAvailable: boolean;
}

// Strip markdown for cleaner TTS output
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s/g, "") // headers
    .replace(/\*\*(.*?)\*\*/g, "$1") // bold
    .replace(/\*(.*?)\*/g, "$1") // italic
    .replace(/`{1,3}[^`]*`{1,3}/g, "") // code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → text only
    .replace(/^[-*+]\s/gm, "") // list bullets
    .replace(/^\d+\.\s/gm, "") // numbered lists
    .replace(/\[(\d+)\]/g, "") // citation markers
    .replace(/\n{3,}/g, "\n\n") // excessive newlines
    .replace(/>/g, "") // blockquotes
    .trim();
}

// Chunk text into ≤200 char sentences for smoother Web Speech synthesis
function chunkText(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if ((current + s).length > 200) {
      if (current) chunks.push(current.trim());
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

export function useSpeech(): SpeechState {
  const { audio } = useSensoryPreferences();
  const emotion = useEmotionEngine();

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopSignalRef = useRef(false);

  // Detect Web Speech API availability
  const [browserMode, setBrowserMode] = useState<SpeechMode>("unavailable");
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      setBrowserMode("browser");
    }
  }, []);

  const isAvailable = audio && browserMode !== "unavailable";

  const stop = useCallback(() => {
    stopSignalRef.current = true;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stop(), [stop]);

  const speakWithBrowser = useCallback(async (text: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!("speechSynthesis" in window)) {
        reject(new Error("Web Speech not available"));
        return;
      }

      window.speechSynthesis.cancel();
      const chunks = chunkText(text);
      let chunkIndex = 0;

      const speakChunk = () => {
        if (stopSignalRef.current || chunkIndex >= chunks.length) {
          setIsSpeaking(false);
          resolve();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
        speechRef.current = utterance;

        // Prefer a South African/British English voice if available
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(
          (v) =>
            v.lang === "en-ZA" ||
            v.name.includes("South Africa") ||
            v.lang === "en-GB",
        );
        if (preferred) utterance.voice = preferred;

        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = 0.9;

        utterance.onend = () => {
          chunkIndex++;
          speakChunk();
        };

        utterance.onerror = (e) => {
          // 'interrupted' is normal when stop() is called
          if (e.error === "interrupted" || e.error === "canceled") {
            resolve();
          } else {
            reject(new Error(`Speech error: ${e.error}`));
          }
        };

        window.speechSynthesis.speak(utterance);
      };

      // Chrome needs a short delay for voices to load
      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.onvoiceschanged = null;
          speakChunk();
        };
      } else {
        speakChunk();
      }
    });
  }, []);

  const speakWithHF = useCallback(async (text: string): Promise<void> => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 500) }),
      });

      if (!res.ok) {
        throw new Error(`TTS API returned ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      setIsLoading(false);
      setIsSpeaking(true);

      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Audio playback failed"));
        };
        audio.play().catch(reject);
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const speak = useCallback(
    async (text: string, useHQ = false): Promise<void> => {
      if (!audio) return; // audio preference is off
      if (isSpeaking) stop();

      setError(null);
      stopSignalRef.current = false;

      const cleaned = stripMarkdown(text);
      if (!cleaned) return;

      setIsSpeaking(true);
      emotion.transition("processing");

      try {
        if (useHQ) {
          await speakWithHF(cleaned);
        } else if (browserMode === "browser") {
          await speakWithBrowser(cleaned);
        } else {
          await speakWithHF(cleaned);
        }
        emotion.transition("resolved");
        setTimeout(() => emotion.transition("dormant"), 1500);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Speech failed";
        setError(msg);
        // Try browser fallback if HF failed
        if (useHQ && browserMode === "browser") {
          try {
            await speakWithBrowser(cleaned);
          } catch {
            // Both failed — silent
          }
        }
      } finally {
        if (!stopSignalRef.current) {
          setIsSpeaking(false);
        }
      }
    },
    [
      audio,
      isSpeaking,
      stop,
      emotion,
      browserMode,
      speakWithBrowser,
      speakWithHF,
    ],
  );

  return {
    isSpeaking,
    isLoading,
    mode: browserMode,
    error,
    speak,
    stop,
    isAvailable,
  };
}
