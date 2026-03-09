// src/components/sentient/SensoryControls.tsx
'use client';

import { useSensoryPreferences } from '@/hooks/useSensoryPreferences';

export default function SensoryControls() {
  const { audio, haptics, motion, toggle, isTouchDevice } = useSensoryPreferences();

  return (
    <div className="fixed bottom-6 right-6 z-[9998] flex gap-2 font-mono text-[10px] tracking-widest uppercase opacity-30 hover:opacity-100 transition-opacity duration-300">
      <button
        onClick={() => toggle('audio')}
        className={`px-3 py-1.5 rounded-full border transition ${
          audio
            ? 'border-emerald-500/50 text-emerald-400'
            : 'border-neutral-800 text-neutral-500'
        }`}
        aria-label={`Audio ${audio ? 'on' : 'off'}`}
        aria-pressed={audio}
      >
        Audio
      </button>

      {isTouchDevice && (
        <button
          onClick={() => toggle('haptics')}
          className={`px-3 py-1.5 rounded-full border transition ${
            haptics
              ? 'border-emerald-500/50 text-emerald-400'
              : 'border-neutral-800 text-neutral-500'
          }`}
          aria-label={`Haptics ${haptics ? 'on' : 'off'}`}
          aria-pressed={haptics}
        >
          Haptics
        </button>
      )}

      <button
        onClick={() => toggle('motion')}
        className={`px-3 py-1.5 rounded-full border transition ${
          motion
            ? 'border-emerald-500/50 text-emerald-400'
            : 'border-neutral-800 text-neutral-500'
        }`}
        aria-label={`Motion ${motion ? 'on' : 'off'}`}
        aria-pressed={motion}
      >
        Motion
      </button>
    </div>
  );
}
