'use client';

/**
 * SpeakButton — Accessible TTS Trigger Component
 *
 * Wraps useSpeech hook into a compact, reusable button.
 * Respects sensory preferences (audio: false = hidden).
 * Shows animated waveform while speaking.
 *
 * Used in: MindfulDisclosure, WisdomCardInline, ErrorExperience,
 *          and any place an AI-generated message should be readable aloud.
 */

import { Volume2, VolumeX, Loader2 } from 'lucide-react';
import { useSpeech } from '@/hooks/useSpeech';
import { useSensoryPreferences } from '@/hooks/useSensoryPreferences';

interface SpeakButtonProps {
  text: string;
  emotionContext?: 'neutral' | 'encouraging' | 'cautionary' | 'celebratory';
  className?: string;
  useHQ?: boolean;
}

export function SpeakButton({
  text,
  className = '',
  useHQ = false,
}: SpeakButtonProps) {
  const speech = useSpeech();
  const prefs = useSensoryPreferences();

  // Respect the global audio toggle
  if (!prefs.audio || !speech.isAvailable) return null;

  const handleClick = async () => {
    if (speech.isSpeaking) {
      speech.stop();
      return;
    }
    await speech.speak(text, useHQ);
  };

  return (
    <button
      onClick={() => void handleClick()}
      aria-label={speech.isSpeaking ? 'Stop reading' : 'Read aloud'}
      aria-pressed={speech.isSpeaking}
      title={speech.isSpeaking ? 'Stop' : 'Read aloud'}
      className={`
        flex items-center justify-center w-7 h-7 rounded-lg
        text-zinc-500 hover:text-white transition-colors
        disabled:opacity-30 ${className}
      `}
      disabled={speech.isLoading}
    >
      {speech.isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : speech.isSpeaking ? (
        <VolumeX className="w-3.5 h-3.5 text-emerald-400" />
      ) : (
        <Volume2 className="w-3.5 h-3.5" />
      )}
    </button>
  );
}
