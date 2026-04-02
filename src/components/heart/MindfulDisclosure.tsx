"use client";

/**
 * MindfulDisclosure — Progressive Cognitive Load Management
 *
 * Implements three-layer progressive disclosure:
 * Layer 1: Core message — always visible, human-first language
 * Layer 2: Technical details — expandable, for those who want depth
 * Layer 3: Wisdom note — contextual education, turns errors into learning
 *
 * Cognitive science grounding:
 * - Cognitive Load Theory (Sweller): working memory is severely limited.
 *   Disclosure reveals detail only on request.
 * - Miller's Law: max 3-4 chunks per response.
 * - Hick's Law: fewer choices = faster decisions.
 * - AnimatePresence mode="wait": exit completes before enter begins,
 *   presenting one piece of information at a time.
 *
 * TTS: every layer is independently speakable.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, ChevronDown, Terminal } from "lucide-react";
import { SpeakButton } from "./SpeakButton";

interface WisdomNote {
  concept: string;
  explanation: string;
}

interface MindfulDisclosureProps {
  coreMessage: string;
  technicalDetails?: string;
  wisdomNote?: WisdomNote;
  emotionContext?: "neutral" | "encouraging" | "cautionary" | "celebratory";
  enableTTS?: boolean;
}

const ACCENT_COLORS: Record<string, string> = {
  neutral: "text-emerald-400 border-emerald-500/20",
  encouraging: "text-sky-400 border-sky-500/20",
  cautionary: "text-amber-400 border-amber-500/20",
  celebratory: "text-violet-400 border-violet-500/20",
};

const HEART_COLORS: Record<string, string> = {
  neutral: "text-emerald-400",
  encouraging: "text-sky-400",
  cautionary: "text-amber-400",
  celebratory: "text-violet-400",
};

/**
 * Inline WisdomCard — contextual education during task execution.
 * Follows Brilliant.org's principle: start with the simplest version of an idea.
 * Follows Duolingo's principle: hints appear when needed, not before.
 */
function WisdomCardInline({
  concept,
  explanation,
  enableTTS,
}: WisdomNote & { enableTTS: boolean }) {
  return (
    <div className="mt-2 p-4 border-l-2 border-emerald-500/50 bg-emerald-500/5 rounded-r-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs uppercase tracking-widest">
          <span>💡</span>
          <span>Knowledge Transfer: {concept}</span>
        </div>
        {enableTTS && (
          <SpeakButton
            text={`${concept}. ${explanation}`}
            emotionContext="encouraging"
            className="w-7 h-7"
          />
        )}
      </div>
      <p className="text-sm leading-relaxed text-zinc-400">{explanation}</p>
    </div>
  );
}

export default function MindfulDisclosure({
  coreMessage,
  technicalDetails,
  wisdomNote,
  emotionContext = "neutral",
  enableTTS = true,
}: MindfulDisclosureProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showWisdom, setShowWisdom] = useState(false);

  const accentClass = ACCENT_COLORS[emotionContext] ?? ACCENT_COLORS["neutral"];
  const heartClass = HEART_COLORS[emotionContext] ?? HEART_COLORS["neutral"];

  return (
    <div
      className={`
        flex flex-col gap-3 p-6
        bg-zinc-900/50 rounded-xl
        border backdrop-blur-sm transition-colors duration-500
        ${accentClass}
      `}
    >
      {/* ── LAYER 1: Core Human Message — always visible ── */}
      <div className="flex gap-4 items-start">
        <div className={`mt-1 shrink-0 ${heartClass}`}>
          <Heart size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-lg text-zinc-100 font-medium leading-snug whitespace-pre-line">
            {coreMessage}
          </p>
          {enableTTS && (
            <div className="mt-2">
              <SpeakButton text={coreMessage} emotionContext={emotionContext} />
            </div>
          )}
        </div>
      </div>

      {/* ── LAYER 2: Progressive Disclosure Controls ── */}
      {(technicalDetails || wisdomNote) && (
        <div className="flex gap-4 ml-10 text-xs font-mono flex-wrap">
          {technicalDetails && (
            <button
              onClick={() => {
                setIsExpanded((v) => !v);
                setShowWisdom(false);
              }}
              className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-expanded={isExpanded}
              aria-controls="technical-details"
            >
              <Terminal size={12} />
              <span>{isExpanded ? "Fold details" : "Technical logs"}</span>
              <motion.div
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown size={12} />
              </motion.div>
            </button>
          )}
          {wisdomNote && (
            <button
              onClick={() => {
                setShowWisdom((v) => !v);
                setIsExpanded(false);
              }}
              className="text-zinc-500 hover:text-emerald-400 transition-colors"
              aria-expanded={showWisdom}
              aria-controls="wisdom-note"
            >
              {showWisdom ? "← Back to message" : "💡 Why this matters"}
            </button>
          )}
        </div>
      )}

      {/* ── LAYER 3: Expandable Content ── */}
      {/* AnimatePresence mode="wait" ensures exit completes before enter begins. */}
      <AnimatePresence mode="wait">
        {isExpanded && technicalDetails && (
          <motion.div
            key="technical"
            id="technical-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden ml-10"
          >
            <pre className="p-4 bg-black/50 text-zinc-400 text-xs rounded-md mt-2 border border-zinc-800 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
              {technicalDetails}
            </pre>
          </motion.div>
        )}

        {showWisdom && wisdomNote && (
          <motion.div
            key="wisdom"
            id="wisdom-note"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="ml-10"
          >
            <WisdomCardInline
              concept={wisdomNote.concept}
              explanation={wisdomNote.explanation}
              enableTTS={enableTTS}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
