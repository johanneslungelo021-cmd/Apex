'use client';

/**
 * ErrorExperience — Ubuntu-Grounded Error UI Component
 *
 * Renders humanized errors through MindfulDisclosure with:
 * - Staggered action buttons (Hick's Law: fewer choices = faster decisions)
 * - Primary action highlighted in emerald (recommended path)
 * - Secondary actions subdued (available but not pushed)
 * - Progressive reveal animation to guide attention
 *
 * Never blames the user. Never uses humor. Never disappears before
 * the user has read the message (no toast pattern).
 *
 * Architecture: receives ApexError, runs through empathyEngine,
 * renders empathetically. The caller owns error recovery logic
 * via the onAction callback.
 */

import { motion } from 'framer-motion';
import { RefreshCw, MessageCircle, Bell, Shield, AlertTriangle } from 'lucide-react';
import MindfulDisclosure from './MindfulDisclosure';
import { humanizeError, severityToColorClass, type ApexError } from '@/lib/agents/empathyEngine';

interface ErrorExperienceProps {
  error: ApexError;
  onAction: (action: string) => void;
  className?: string;
}

// Icon mapping for action types
const ACTION_ICONS: Record<string, typeof RefreshCw> = {
  retry_delayed:     RefreshCw,
  retry_immediate:   RefreshCw,
  retry_generation:  RefreshCw,
  adjust_slippage:   MessageCircle,
  monitor_path:      Bell,
  check_status:      Shield,
  check_reserves:    Shield,
  rephrase_prompt:   MessageCircle,
  escalate_human:    MessageCircle,
  report_error:      AlertTriangle,
  refine_search:     MessageCircle,
  browse_categories: MessageCircle,
  add_funds:         AlertTriangle,
  use_cache:         RefreshCw,
};

export default function ErrorExperience({
  error,
  onAction,
  className = '',
}: ErrorExperienceProps) {
  const humanized = humanizeError(error);
  const borderClass = severityToColorClass(error.severity);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`space-y-4 ${className}`}
    >
      {/* Severity indicator strip */}
      {error.severity === 'critical' && (
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium border ${borderClass}`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
          <span className="text-red-400">Critical issue — your attention is needed</span>
        </motion.div>
      )}

      {/* Empathetic core message with progressive disclosure */}
      <MindfulDisclosure
        coreMessage={humanized.coreMessage}
        technicalDetails={humanized.technicalDetails}
        wisdomNote={humanized.wisdomNote}
        emotionContext={humanized.emotionContext}
        enableTTS={true}
      />

      {/* Action buttons — staggered entry, Hick's Law (max 3) */}
      <div className="flex flex-wrap gap-3 ml-10">
        {humanized.suggestedActions.map((action, i) => {
          const Icon = ACTION_ICONS[action.action] ?? RefreshCw;
          const isPrimary = i === 0;

          return (
            <motion.button
              key={action.action}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * (i + 1), duration: 0.25 }}
              onClick={() => onAction(action.action)}
              className={`
                flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200
                ${isPrimary
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                  : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700 hover:text-zinc-200 hover:bg-zinc-700/50'
                }
              `}
            >
              <Icon size={14} />
              {action.label}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
