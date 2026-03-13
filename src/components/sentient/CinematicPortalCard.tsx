'use client';

/**
 * CinematicPortalCard — Compound Interest Edition
 *
 * COMPOUND INTEREST ARCHITECTURE:
 *   Layer 1 — API Correctness:  hooks called with their real signatures
 *   Layer 2 — Emotion Mapping:  portal emotion ↦ EmotionState + GLOW_MAP
 *   Layer 3 — Sensory Trigger:  audio/haptic compounds on visual transition
 *   Layer 4 — Motion Stagger:   framer-motion reveals scale with emotion intensity
 *   Layer 5 — Scan Shimmer:     CSS keyframe shimmer compounds with all above
 *
 * Each layer multiplies the previous — zero stand-alone effects.
 */

import { useState, useRef, useCallback, useEffect, type CSSProperties } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, type Variants } from 'framer-motion';

// ─── Real hook APIs (no assumed methods) ────────────────────────────────────
import { useEmotionEngine, type EmotionState } from '@/hooks/useEmotionEngine';
import { useMultiSensory } from '@/hooks/useMultiSensory';
import { useMagneticCursor } from '@/hooks/useMagneticCursor';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PortalEmotion =
  | 'calm'
  | 'focused'
  | 'volatile'
  | 'optimistic'
  | 'joyful';

export interface PortalProps {
  id: string;
  title: string;
  /** Comes live from your API route */
  subtitle: string;
  videoSrc: string;
  href: string;
  emotionState: PortalEmotion;
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

/**
 * replaceAlpha — swap the alpha channel of an rgba() string.
 *
 * BUG FIXED: naive `.replace(')', ',0.12)')` appended a 5th arg to rgba(),
 * producing `rgba(r,g,b,orig,new)` — invalid CSS, renders transparent.
 * This helper correctly rewrites only the 4th arg.
 *
 *   'rgba(148,163,184,0.25)', 0.12  →  'rgba(148,163,184,0.12)'
 */
function replaceAlpha(rgba: string, alpha: number): string {
  return rgba.replace(/[\d.]+\)$/, `${alpha})`);
}

/**
 * scaleGlowSpread — scale the px radii of a box-shadow string by factor.
 *
 * BUG FIXED: the original `config.glow.replace(/[\d.]+\)$/, intensity)` was
 * replacing the rgba alpha with the intensity value (e.g. 1.4), leaving the
 * visible spread unchanged.  Intensity should enlarge the glow radius.
 *
 *   '0 0 60px 8px rgba(16,185,129,0.35)', 1.4
 *     →  '0 0 84.0px 11.2px rgba(16,185,129,0.35)'
 */
function scaleGlowSpread(shadow: string, factor: number): string {
  return shadow.replace(/([\d.]+)px/g, (_, n) => `${(parseFloat(n) * factor).toFixed(1)}px`);
}

// ─── Layer 2: Emotion mapping ─────────────────────────────────────────────────
// Maps the 5 portal emotions → the 4 canonical EmotionStates + visual tokens

type GlowConfig = {
  engineState: EmotionState;
  /** Tailwind-compatible rgba glow for box-shadow */
  glow: string;
  /** Border accent colour */
  border: string;
  /** Tint overlay on video */
  overlay: string;
  /** Badge pill label */
  badge: string;
};

const EMOTION_MAP: Record<PortalEmotion, GlowConfig> = {
  calm: {
    engineState: 'dormant',
    glow:        '0 0 60px 8px rgba(148,163,184,0.18)',
    border:      'rgba(148,163,184,0.25)',
    overlay:     'rgba(30,41,59,0.35)',
    badge:       'CALM',
  },
  focused: {
    engineState: 'processing',
    glow:        '0 0 70px 10px rgba(139,92,246,0.30)',
    border:      'rgba(139,92,246,0.40)',
    overlay:     'rgba(88,28,135,0.25)',
    badge:       'FOCUSED',
  },
  volatile: {
    engineState: 'awakened',
    glow:        '0 0 80px 14px rgba(16,185,129,0.35)',
    border:      'rgba(16,185,129,0.45)',
    overlay:     'rgba(6,78,59,0.20)',
    badge:       'VOLATILE',
  },
  optimistic: {
    engineState: 'resolved',
    glow:        '0 0 65px 10px rgba(56,189,248,0.30)',
    border:      'rgba(56,189,248,0.40)',
    overlay:     'rgba(12,74,110,0.20)',
    badge:       'OPTIMISTIC',
  },
  joyful: {
    engineState: 'resolved',
    glow:        '0 0 75px 12px rgba(250,204,21,0.28)',
    border:      'rgba(250,204,21,0.38)',
    overlay:     'rgba(113,63,18,0.18)',
    badge:       'JOYFUL',
  },
};

// ─── Layer 4: Motion variant definitions ─────────────────────────────────────
// Stagger timing is scaled by emotion intensity from the engine
// TS fix: explicit Variants type required — framer-motion's strict types reject
// inline transition objects inside variant keys without it.

const subtitleVariants: Variants = {
  hidden:  { opacity: 0, y: 20, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0,  filter: 'blur(0px)',
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, y: 8,  filter: 'blur(2px)',
    transition: { duration: 0.25 } },
};

const enterBtnVariants: Variants = {
  hidden:  { opacity: 0, x: 12, scale: 0.92 },
  visible: { opacity: 1, x: 0,  scale: 1,
    transition: { delay: 0.12, duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  exit:    { opacity: 0, x: 6,  scale: 0.96,
    transition: { duration: 0.2 } },
};

const idVariants: Variants = {
  rest:    { opacity: 0.45, letterSpacing: '0.15em' },
  hovered: { opacity: 1,    letterSpacing: '0.30em',
    transition: { duration: 0.4, ease: 'easeOut' } },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CinematicPortalCard({
  id,
  title,
  subtitle,
  videoSrc,
  href,
  emotionState,
}: PortalProps) {
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // ── Layer 1: Real hook APIs ──────────────────────────────────────────────
  const { transition, intensity } = useEmotionEngine();   // was: setEmotion()
  const { trigger }               = useMultiSensory();    // was: playHapticFeedback / playAmbientSound
  const { isHovering }            = useMagneticCursor();  // was: setCursorState()

  const config = EMOTION_MAP[emotionState];

  // ── Layer 3: Compound sensory trigger ────────────────────────────────────
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    // Layer 1 + 2: transition the global emotion engine to this portal's state
    transition(config.engineState);
    // Layer 3: audio + haptic trigger fires AFTER visual state lands
    trigger(config.engineState);
    videoRef.current?.play().catch(() => {});
  }, [config.engineState, transition, trigger]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    transition('dormant');
    trigger('dormant');
    videoRef.current?.pause();
  }, [transition, trigger]);

  // Layer 4: intensity from engine scales the card's glow SPREAD RADIUS (not alpha)
  const dynamicGlow = isHovered
    ? scaleGlowSpread(config.glow, Math.min(intensity, 2))
    : 'none';

  // Layer 5: scan-line shimmer — visible only while hovered
  const shimmerStyle: CSSProperties = isHovered
    ? { animation: 'apexScanline 2.4s linear infinite' }
    : {};

  // Bug 3 fix: inject keyframes once per document, not once per card instance.
  // 6 cards × naive <style> = 12 duplicate @keyframes blocks in the DOM.
  //
  // Ref counter pattern (CodeRabbit recommendation):
  //   - Increment on mount, decrement on unmount
  //   - Inject when counter goes 0→1 (first card), remove when 1→0 (last card)
  //   - Unconditional cleanup was wrong — it removed the element when any card
  //     unmounted, even if 5 others still needed it
  useEffect(() => {
    const MARKER = 'data-apex-portal-keyframes';
    const COUNTER_KEY = '__apexPortalCardCount__';
    const win = window as typeof window & { [COUNTER_KEY]?: number };

    win[COUNTER_KEY] = (win[COUNTER_KEY] ?? 0) + 1;

    if (!document.querySelector(`[${MARKER}]`)) {
      const style = document.createElement('style');
      style.setAttribute(MARKER, '');
      style.textContent = `
        @keyframes apexScanline {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(200%); }
        }
        @keyframes apexPulseRing {
          0%   { opacity: 0.6; transform: scale(0.96); }
          50%  { opacity: 0.2; transform: scale(1.04); }
          100% { opacity: 0.6; transform: scale(0.96); }
        }
      `;
      document.head.appendChild(style);
    }

    return () => {
      win[COUNTER_KEY] = (win[COUNTER_KEY] ?? 1) - 1;
      // Only remove when the very last portal card unmounts
      if (win[COUNTER_KEY] === 0) {
        document.querySelector(`[${MARKER}]`)?.remove();
      }
    };
  }, []);

  return (
    <>
      {/* Layer 5: keyframe injection — guard prevents duplicate injection across 6 cards */}

      <Link
        href={href}
        className="group block min-w-[420px] h-[520px] rounded-3xl overflow-hidden relative snap-start outline-none"
        style={{
          // Layer 2 compounds with Layer 4 intensity
          boxShadow: dynamicGlow,
          border: `1px solid ${isHovered ? config.border : 'rgba(255,255,255,0.07)'}`,
          transition: 'box-shadow 0.6s ease, border-color 0.4s ease',
          // Glass substrate
          background: 'rgba(10,10,14,0.72)',
          backdropFilter: 'blur(18px) saturate(160%)',
          WebkitBackdropFilter: 'blur(18px) saturate(160%)',
        }}
      >
        {/* ── Cinematic video background ───────────────────────────────── */}
        <video
          ref={videoRef}
          src={videoSrc}
          muted
          loop
          playsInline
          preload="none"
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            opacity: isHovered ? 1 : 0.35,
            transform: isHovered ? 'scale(1.06)' : 'scale(1.0)',
            transition: 'opacity 0.9s ease, transform 1.1s cubic-bezier(0.22,1,0.36,1)',
          }}
        />

        {/* ── Layer 2: Emotion tint overlay ────────────────────────────── */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background: `linear-gradient(to top, rgba(0,0,0,0.88) 0%, ${config.overlay} 55%, rgba(0,0,0,0.10) 100%)`,
            transition: 'background 0.6s ease',
          }}
        />

        {/* ── Layer 5: Scan shimmer streak ─────────────────────────────── */}
        {isHovered && (
          <div
            className="absolute inset-0 z-20 pointer-events-none overflow-hidden rounded-3xl"
            aria-hidden="true"
          >
            <div
              className="absolute left-0 right-0 h-[30%]"
              style={{
                background: `linear-gradient(to bottom, transparent 0%, ${replaceAlpha(config.border, 0.12)} 50%, transparent 100%)`,
                ...shimmerStyle,
              }}
            />
          </div>
        )}

        {/* ── Pulse ring (magnetic cursor compound) ────────────────────── */}
        {isHovering && isHovered && (
          <div
            className="absolute inset-4 rounded-3xl z-20 pointer-events-none"
            style={{
              border: `1px solid ${config.border}`,
              animation: 'apexPulseRing 1.8s ease-in-out infinite',
            }}
            aria-hidden="true"
          />
        )}

        {/* ── Content layer ────────────────────────────────────────────── */}
        <div
          className="absolute inset-0 z-30 flex flex-col justify-between p-8"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Top row: emotion badge + id */}
          <div className="flex items-start justify-between">
            {/* Layer 2: emotion badge reflects current portal emotion */}
            <motion.span
              className="px-3 py-1 rounded-full text-[10px] font-mono tracking-[3px] uppercase"
              style={{
                background: replaceAlpha(config.border, 0.15),
                border: `1px solid ${config.border}`,
                color: 'rgba(255,255,255,0.70)',
              }}
              animate={{ opacity: isHovered ? 1 : 0.5 }}
              transition={{ duration: 0.3 }}
            >
              {config.badge}
            </motion.span>

            {/* Layer 4: id letter-spacing widens on hover */}
            <motion.span
              className="font-mono text-xs text-white/40 tabular-nums"
              variants={idVariants}
              animate={isHovered ? 'hovered' : 'rest'}
            >
              {id}
            </motion.span>
          </div>

          {/* Bottom row: title + reveal content */}
          <div className="flex items-end justify-between">
            <div className="flex-1 min-w-0 pr-4">
              {/* Title — always visible, lifts on hover */}
              <motion.h2
                className="font-semibold tracking-tighter text-white leading-none"
                style={{
                  fontFamily: "'Bebas Neue', 'DIN Condensed', 'Impact', sans-serif",
                  fontSize: 'clamp(3rem, 5vw, 4rem)',
                }}
                animate={{
                  y: isHovered ? -4 : 0,
                  textShadow: isHovered
                    ? `0 0 30px ${config.border}`
                    : '0 0 0px transparent',
                }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                {title}
              </motion.h2>

              {/* Layer 4: subtitle stagger-reveals with blur wipe */}
              <AnimatePresence>
                {isHovered && (
                  <motion.p
                    key="subtitle"
                    className="text-white/75 mt-3 leading-snug text-sm max-w-[280px]"
                    variants={subtitleVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    {subtitle}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Layer 4: ENTER button stagger-reveals after subtitle */}
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  key="enter-btn"
                  variants={enterBtnVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  // data-magnetic makes MagneticReticle scale up on proximity
                  data-magnetic="true"
                >
                  <span
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-medium text-white whitespace-nowrap"
                    style={{
                      background: 'rgba(255,255,255,0.10)',
                      backdropFilter: 'blur(14px)',
                      border: `1px solid ${config.border}`,
                      boxShadow: `0 0 20px ${replaceAlpha(config.border, 0.20)}`,
                    }}
                  >
                    ENTER
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M1 6h10M7 2l4 4-4 4" />
                    </svg>
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </Link>
    </>
  );
}
