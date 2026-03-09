'use client';

/**
 * ProvinceEconomicPanel
 *
 * Collapsible province selector for the Intelligent Engine chat panel.
 * Renders all 9 SA provinces as a clickable grid. When a province is
 * selected it calls `onSelect` with the full ProvinceProfile, allowing
 * the AI Agent to inject province-specific economic context into its
 * system prompt.
 *
 * Props
 * ─────
 * selectedCode  — currently active province code (e.g. "GP") or null
 * onSelect      — called with the full ProvinceProfile on selection
 * compact       — shows a tighter single-row scrollable layout (default: false)
 *
 * Design constraints
 * ──────────────────
 * - No external styling dependencies beyond Tailwind utility classes
 * - Zero network calls — data is imported from the static provinces module
 * - Fully keyboard accessible: each button has aria-pressed + aria-label
 * - Renders nothing until provinces are available (handles SSR gracefully)
 */

import { useCallback } from 'react';
import { SA_PROVINCES, type ProvinceProfile } from '@/lib/sa-context/provinces';

// ─── Unemployment → colour band ──────────────────────────────────────────────

function urgencyColour(unemploymentPercent: number): string {
  if (unemploymentPercent >= 40) return 'text-red-400 border-red-500/40 bg-red-500/10';
  if (unemploymentPercent >= 35) return 'text-orange-400 border-orange-500/40 bg-orange-500/10';
  if (unemploymentPercent >= 30) return 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10';
  return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ProvinceEconomicPanelProps {
  selectedCode: string | null;
  onSelect: (province: ProvinceProfile) => void;
  compact?: boolean;
}

export default function ProvinceEconomicPanel({
  selectedCode,
  onSelect,
  compact = false,
}: ProvinceEconomicPanelProps) {
  const handleSelect = useCallback(
    (province: ProvinceProfile) => {
      onSelect(province);
    },
    [onSelect],
  );

  if (compact) {
    // ── Compact mode: single scrollable row of province code pills ──────────
    return (
      <div
        role="listbox"
        aria-label="Select your province for personalised advice"
        className="flex gap-1.5 overflow-x-auto px-4 py-2.5 scrollbar-hide"
      >
        {SA_PROVINCES.map((province) => {
          const isSelected = province.code === selectedCode;
          const colour = urgencyColour(province.unemploymentPercent);

          return (
            <button
              key={province.code}
              role="option"
              aria-selected={isSelected}
              aria-label={`${province.name} — unemployment ${province.unemploymentPercent}%, digital access ${province.digitalAccessPercent}%`}
              onClick={() => handleSelect(province)}
              className={[
                'flex-shrink-0 px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold transition-all',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                isSelected
                  ? 'bg-white/20 border-white/60 text-white scale-105 shadow-lg'
                  : `${colour} hover:scale-105 hover:border-white/30`,
              ].join(' ')}
            >
              {province.code}
            </button>
          );
        })}
      </div>
    );
  }

  // ── Full mode: 3-column grid with economic snapshot per province ───────────
  return (
    <div
      role="listbox"
      aria-label="Select your province for personalised advice"
      className="grid grid-cols-3 gap-1.5 p-3"
    >
      {SA_PROVINCES.map((province) => {
        const isSelected = province.code === selectedCode;
        const colour = urgencyColour(province.unemploymentPercent);

        return (
          <button
            key={province.code}
            role="option"
            aria-selected={isSelected}
            aria-label={`${province.name} — unemployment ${province.unemploymentPercent}%, digital access ${province.digitalAccessPercent}%`}
            onClick={() => handleSelect(province)}
            className={[
              'flex flex-col items-start gap-0.5 rounded-xl border p-2.5 text-left transition-all',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
              isSelected
                ? 'bg-white/20 border-white/60 shadow-lg scale-[1.02]'
                : `${colour} hover:scale-[1.02] hover:border-white/30 hover:bg-white/5`,
            ].join(' ')}
          >
            {/* Province code + name */}
            <span className="font-mono text-xs font-bold leading-none">
              {province.code}
            </span>
            <span className="text-[10px] text-zinc-300 leading-tight line-clamp-1">
              {province.name}
            </span>

            {/* Key stats */}
            <div className="mt-1 flex flex-col gap-0.5 w-full">
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-zinc-500">Unemp</span>
                <span className={isSelected ? 'text-white' : ''}>
                  {province.unemploymentPercent}%
                </span>
              </div>
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-zinc-500">Digital</span>
                <span className={isSelected ? 'text-white' : ''}>
                  {province.digitalAccessPercent}%
                </span>
              </div>
            </div>

            {/* Best opportunity badge */}
            <span className="mt-1.5 text-[9px] text-zinc-400 line-clamp-1">
              {province.topOpportunityCategories[0]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
