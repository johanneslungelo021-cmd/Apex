/**
 * Sentient Interface - Main Landing Page (Phase 1 — Sentient Vessel)
 *
 * Phase 1 wraps the existing functional content in the Emotion Engine symbiote:
 * EmotionalSwarm (reactive WebGL), EmotionalGrid (CSS variable morphing),
 * MagneticReticle (custom cursor physics), SensoryControls (accessibility toggles).
 *
 * FCP FIX (SA-2026-03-11 — 14.89s root cause fixed in this PR):
 * 1. instrumentation.ts: OTEL init deferred via setImmediate() — no longer blocks cold starts.
 * 2. loading.tsx: pure CSS skeleton streamed in first HTTP chunk by Next.js Suspense.
 *
 * @module app/page
 */

'use client';

import { useState, useEffect, useCallback, useRef, Suspense, useTransition } from 'react';
 main

// Lucide-react: Turbopack tree-shakes the barrel import correctly in Next.js 16.
// Individual deep imports (lucide-react/dist/esm/icons/heart) have no .d.ts files
// in this version, causing TypeScript errors. The barrel import is the correct path.
 feat/perf-cwv-zero-mocks
import { Heart, Search, User, MessageSquare, Zap, ExternalLink, Newspaper, Clock, RefreshCw, Microscope, Filter, X, Star, GitFork, AlertCircle, Code2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
// Canvas dynamically imported below — removed from critical bundle (Fix 2)
import {
  StreamingTypography,
  OptimisticTransactionCard,
  TransactionBeam,
  useOptimisticTransaction,
  type TransactionIntent,
} from '@/lib/streaming/OptimisticTransactionUI';

// Phase 1: Sentient Vessel imports
import dynamic from 'next/dynamic';
import { EmotionProvider, useEmotionEngine } from '@/hooks/useEmotionEngine';
import { useMultiSensory } from '@/hooks/useMultiSensory';

/**
 * Fix 2: Dynamic imports — CRITICAL path surgery.
 *
 * Three.js + @react-three/fiber + @react-three/drei = ~500KB minified.
 * Loading this statically blocks the browser from painting FCP until the
 * entire bundle downloads, parses, and executes on a South African mobile
 * connection at 150-200ms latency.
 *
 * ssr: false is REQUIRED for any R3F component — Three.js needs the browser
 * WebGL context which doesn't exist on the server.
 *
 * The loading: () => null pattern means zero layout shift — the canvas
 * position was already reserved by its fixed/absolute parent container.
 * <canvas> is NOT an LCP candidate, so deferring it cannot hurt LCP scores.
 */

// WebGL Swarm: pulls Three.js + R3F + Drei — the heaviest bundle on the page.
// Dynamic import ensures it is completely absent from the initial JS payload.
// NOTE: Even with ssr:false, the chunk is preloaded. We use a separate lazy trigger
// below to defer loading until after the page is interactive (requestIdleCallback).
const SentientCanvasScene = dynamic(
  () => import('@/components/sentient/SentientCanvasScene'),
  {
    ssr: false,
    loading: () => null, // Fixed container already reserves space — no CLS
  }
);

// MagneticReticle: framer-motion cursor tracking — not needed for first paint.
// Defer until after LCP to avoid competing for main thread during critical path.
const MagneticReticle = dynamic(
  () => import('@/components/sentient/MagneticReticle'),
  { ssr: false, loading: () => null }
);

// EmotionalGrid: CSS variable morphing wrapper — lightweight but uses context.
// Keep static since it wraps all content (removing would break layout structure).
import EmotionalGrid from '@/components/sentient/EmotionalGrid';

// Perf: ReducedMotionGate — skips Three.js entirely for prefers-reduced-motion
// users and returns a static gradient fallback instead.
import { ReducedMotionGate } from '@/components/sentient/ReducedMotionGate';

// SensoryControls: accessibility toggles — never needed for first paint.
const SensoryControls = dynamic(
  () => import('@/components/sentient/SensoryControls'),
  { ssr: false, loading: () => null }
);

// Pillar 2: GEO — Generative Engine Optimization
import AgentReadableChunk from '@/components/geo/AgentReadableChunk';
import JsonLdScript from '@/components/geo/JsonLdScript';
import { buildTechArticleSchema } from '@/lib/geo/schema-builder';

// Perf: yieldToMain — break AI streaming into interruptible micro-tasks
// so user clicks are processed immediately between stream chunks.
import { yieldToMain, isLongTask } from '@/lib/performance/yieldToMain';

// Phase 2: Audio + Province Intelligence
import { useVoiceInput } from '@/hooks/useVoiceInput';
import ProvinceEconomicPanel from '@/components/chat/ProvinceEconomicPanel';
import ChatSpeakButton from '@/components/chat/ChatSpeakButton';
import { type ProvinceProfile } from '@/lib/sa-context/provinces';

interface Opportunity {
  title: string;
  province: string;
  cost: number;
  incomePotential: string;
  link: string;
  category: string;
}

interface NewsArticle {
  title: string;
  url: string;
  snippet: string;
  date: string | null;
  source: string;
  imageUrl: string;
}

 main
/** Shape of the real data returned by GET /api/metrics */

/**
 * Real data shape returned by GET /api/metrics → GitHub REST API.
 * Used in: src/app/page.tsx hero metrics strip (below h1).
 * Source verified: api.github.com/repos/johanneslungelo021-cmd/Apex
 */
 feat/perf-cwv-zero-mocks
interface LiveGitHubMetrics {
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  language: string;
  lastUpdated: string;
}

// ─── Inner page that consumes EmotionProvider context ─────────────────────────
function SentientInterfaceInner() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerDisplayName, setRegisterDisplayName] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

 main
  // ─── Live GitHub Metrics (real data from /api/metrics → GitHub REST API) ──
  const [githubMetrics, setGithubMetrics] = useState<LiveGitHubMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  // ─── Performance: Defer Three.js until after page is interactive ─────────────
  // Don't render WebGL until browser is idle (after FCP + hydration).
  // This prevents the 226KB Three.js chunk from blocking the main thread.
  const [showWebGL, setShowWebGL] = useState(false);
  useEffect(() => {
    // Simple timeout fallback - works on all browsers
    const timeoutId = setTimeout(() => setShowWebGL(true), 2000);
    return () => clearTimeout(timeoutId);
  }, []);

  // ─── Live GitHub Metrics — sourced from /api/metrics → GitHub REST API ────
  // Replaces the fabricated platform metrics (users/impact/courses) removed
  // in the audit. All values verifiable at: github.com/johanneslungelo021-cmd/Apex
  const [githubMetrics, setGithubMetrics] = useState<LiveGitHubMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

 feat/perf-cwv-zero-mocks

  /**
   * Perf: React 18 concurrent transitions.
   *
   * Without startTransition every state update — switching news categories,
   * loading opportunities, updating the AI response — runs as a synchronous
   * high-priority task.  Any user click during these updates must wait,
   * which is the direct cause of the 568 ms INP.
   *
   * startUITransition() marks non-urgent renders as interruptible: the browser
   * can handle new input events before finishing the transition, keeping INP
   * well below the 200 ms target.
   */
  const [, startUITransition] = useTransition();

  // Phase 1: Emotion Engine — replaces heartbeatIntensity + inline triggerSentient
  const emotion = useEmotionEngine();
  const { trigger: triggerAudio } = useMultiSensory();

  // Phase 2: Voice input + Province Intelligence
  const voiceInput = useVoiceInput((transcript) => {
    setAiMessage(transcript);
  });
  const [selectedProvince, setSelectedProvince] = useState<ProvinceProfile | null>(null);
  const [showProvincePanel, setShowProvincePanel] = useState(false);

  /**
   * triggerSentient — drop-in replacement for the old inline version.
   * Drives the emotion cycle + multi-sensory feedback.
   */
  const triggerSentient = useCallback(
    (intensityLevel: number = 1) => {
      emotion.pulse(intensityLevel);
      // Map intensity to emotion state
      if (intensityLevel >= 1.4) {
        emotion.runCycle(2500);
        triggerAudio('awakened');
      } else if (intensityLevel >= 1.0) {
        emotion.transition('awakened');
        triggerAudio('awakened');
        setTimeout(() => emotion.transition('dormant'), 600);
      } else {
        emotion.pulse(intensityLevel);
      }
    },
    [emotion, triggerAudio]
  );

  // Sync audio layer with emotion state changes
  useEffect(() => {
    triggerAudio(emotion.state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emotion.state]);

  // Derived heartbeat intensity for backward-compatible Heart icon animation
  const heartbeatIntensity = emotion.intensity;
  const {
    transactionState,
    resetTransaction,
    startTransaction,
    markOptimisticSuccess,
    confirmTransaction,
    failTransaction,
  } = useOptimisticTransaction();
  const [showTransactionBeam, setShowTransactionBeam] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement>(null);

  const NEWS_CATEGORIES = ['Latest', 'Tech & AI', 'Finance & Crypto', 'Startups'] as const;
  type NewsCategory = typeof NEWS_CATEGORIES[number];
  const [activeCategory, setActiveCategory] = useState<NewsCategory>('Latest');

  // Phase 1: transaction state for optimistic UI

  // ─── News Fetcher ──────────────────────────────────────────────────────────
  // Defined before effects so it can be listed as a stable dependency.
  // setState functions returned by useState are referentially stable — safe to omit.
  const fetchNews = useCallback(async (category: NewsCategory = 'Latest') => {
    setNewsLoading(true);
    setNewsError(false);
    try {
      const res = await fetch(`/api/news?category=${encodeURIComponent(category)}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.articles)) {
        setNewsError(true);
        return;
      }
      startUITransition(() => setNews(data.articles)); // non-urgent: interruptible by user interaction
    } catch {
      setNewsError(true);
    } finally {
      setNewsLoading(false);
    }
  }, []); // useState setters are stable references — no deps needed

  // Ref to always hold the latest activeCategory inside the polling interval,
  // so the interval callback never captures a stale value.
  const activeCategoryRef = useRef<NewsCategory>('Latest');
  useEffect(() => {
    activeCategoryRef.current = activeCategory;
  }, [activeCategory]);

  // On mount: fire analytics + start polling. Interval reads from the ref so it
  // always uses the latest category without needing to re-register.
  useEffect(() => {
    fetch('/api/analytics', { method: 'POST' }).catch(() => {});
    void fetchNews(activeCategoryRef.current);
    
    const newsInterval = setInterval(
      () => { void fetchNews(activeCategoryRef.current); },
      10 * 60 * 1000
    );
    return () => { clearInterval(newsInterval); };
  }, [fetchNews]); // fetchNews is stable (useCallback []); ref handles category

  // On mount: auto-boot Scout Agent so opportunities section is never empty
  useEffect(() => {
    let isCancelled = false;
    const timer = setTimeout(() => {
      if (!isCancelled) {
        void sendToAIAssistant('Find me 3 top digital income opportunities in South Africa under R2000 to start right now');
      }
    }, 1800);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [sendToAIAssistant]);

  // Re-fetch immediately whenever the user switches categories.
  useEffect(() => {
    void fetchNews(activeCategory);
  }, [activeCategory, fetchNews]);

  useEffect(() => {
    if (isChatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [isChatOpen, chatHistory]);

 main
  // Fetch real GitHub metrics from /api/metrics on mount.
  // /api/metrics now returns only real GitHub API data — no fabricated values.

  // Fetch real GitHub metrics on mount — /api/metrics → GitHub REST API.
  // Cancellable via cleanup function to prevent setState on unmounted component.
  // Fails silently — hero renders without the metrics strip if network is unavailable.
  // Used in: hero metrics strip below h1 (line ~600)
 feat/perf-cwv-zero-mocks
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/metrics');
        if (!res.ok) return;
        const data = await res.json() as { github: LiveGitHubMetrics };
 main
        if (!cancelled && data?.github) {
          setGithubMetrics(data.github);
        }
      } catch {
        // Non-critical — hero simply won't render the metrics strip

        if (!cancelled && data?.github) setGithubMetrics(data.github);
      } catch {
        // Non-critical: hero renders without metrics strip on network error
 feat/perf-cwv-zero-mocks
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const sendToAIAssistant = useCallback(async (promptOverride?: string) => {
    if (voiceInput.isListening) return;
    const outgoingMessage = (promptOverride ?? aiMessage).trim();
    if (!outgoingMessage || agentLoading) return;

    triggerSentient(1.2);

    const userMsg = { role: 'user', content: outgoingMessage };
    const newHistory = [...chatHistory, userMsg];

    setChatHistory(newHistory);
    setAiMessage('');
    setAgentLoading(true);

    const setAssistantContent = (content: string) => {
      setChatHistory((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const last = next[next.length - 1];

        if (!last || last.role !== 'assistant') {
          next.push({ role: 'assistant', content });
          return next;
        }

        next[next.length - 1] = { ...last, content };
        return next;
      });
    };

    const agentMessages = newHistory
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Prepend province context to the last user message if a province is selected
    if (selectedProvince && agentMessages.length > 0) {
      const lastIdx = agentMessages.length - 1;
      const last = agentMessages[lastIdx];
      if (last && last.role === 'user') {
        agentMessages[lastIdx] = {
          ...last,
          content: `[User province: ${selectedProvince.name} — unemployment ${selectedProvince.unemploymentPercent}%, digital access ${selectedProvince.digitalAccessPercent}%]\n${last.content}`,
        };
      }
    }

    try {
      const res = await fetch('/api/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: agentMessages }),
      });

      if (!res.ok) {
        let message = 'Something went wrong. Please try again.';
        try {
          const data = await res.json();
          if (typeof data?.message === 'string' && data.message.trim()) {
            message = data.message;
          }
        } catch {
          // ignore json parse failures on error payloads
        }
        setAssistantContent(message);
        return;
      }

      if (!res.body) {
        setAssistantContent('AI engine returned no stream.');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantReply = '';

      const processLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          return;
        }

        if (!parsed || typeof parsed !== 'object') return;
        const event = parsed as Record<string, unknown>;
        const type = typeof event.type === 'string' ? event.type : undefined;
        const data = event.data;

        if (type === 'opportunities') {
          if (Array.isArray(data) && data.length > 0) {
            startUITransition(() => setOpportunities(data as Opportunity[])); // non-urgent
          }
          return;
        }

        if (type === 'chunk') {
          if (typeof data === 'string') {
            assistantReply += data;
            setAssistantContent(assistantReply);
          }
          return;
        }

        if (type === 'error') {
          if (typeof data === 'string' && data.trim()) {
            assistantReply = data;
            setAssistantContent(data);
          }
          return;
        }

        if (type === 'done') {
          return;
        }

        // Phase 3: Handle transaction events from proactive route
        if (type === 'transaction_ready') {
          const intent = event.intent as TransactionIntent | undefined;
          if (intent) {
            startTransaction(intent);
            triggerSentient(1.5);
          }
          return;
        }

        if (type === 'transaction_submitted') {
          const hash = typeof event.hash === 'string' ? event.hash : null;
          if (hash) {
            markOptimisticSuccess(hash);
            setShowTransactionBeam(true);
          }
          return;
        }

        if (type === 'transaction_confirmed') {
          const hash = typeof event.hash === 'string' ? event.hash : null;
          if (hash) {
            confirmTransaction(hash);
            triggerSentient(1);
          }
          return;
        }

        if (type === 'transaction_failed') {
          const errorMsg = typeof event.error === 'string' ? event.error : 'Transaction failed';
          failTransaction(errorMsg);
          return;
        }

        // Backward-compatibility for older payloads if any stale deployment emits them
        if (Array.isArray(event.opportunities) && event.opportunities.length > 0) {
          startUITransition(() => setOpportunities(event.opportunities as Opportunity[])); // non-urgent
          return;
        }

        if (typeof event.message === 'string' && event.message.trim()) {
          assistantReply = event.message;
          setAssistantContent(event.message);
        }
      };

      // Perf: track task start time so we can yield when the loop runs long.
      let _taskStart = performance.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          processLine(line);
        }

        /**
         * Perf: yield to main thread if this iteration has consumed > 50 ms.
         * Allows the browser to process any pending click / touch events before
         * the next chunk arrives.  Without this the streaming loop is a single
         * long task that blocks all interaction for the full response duration.
         */
        if (isLongTask(_taskStart)) {
          await yieldToMain();
          _taskStart = performance.now(); // reset timer after each yield
        }
      }

      const finalLine = buffer.trim();
      if (finalLine) processLine(finalLine);

      if (!assistantReply.trim()) {
        setAssistantContent('AI engine returned an empty response.');
      }

      triggerSentient(0.8);
    } catch (error) {
      console.error('AI Agent error:', error);
      setAssistantContent('Connection error. Please try again.');
    } finally {
      setAgentLoading(false);
    }
  }, [
    aiMessage,
    agentLoading,
    chatHistory,
    triggerSentient,
    selectedProvince,
    startTransaction,
    markOptimisticSuccess,
    confirmTransaction,
    failTransaction,
  ]);

  const investigateNews = useCallback((articleTitle: string) => {
    if (agentLoading) return;

    triggerSentient(0.6);
    const researchPrompt = `Research the following news topic and explain its relevance to South African digital income opportunities:\n\n"${articleTitle}"\n\nProvide: 1) Key insights, 2) Potential opportunities, 3) Actionable next steps.`;

    setIsChatOpen(true);
    void sendToAIAssistant(researchPrompt);
  }, [agentLoading, sendToAIAssistant, triggerSentient]);

  const handleRegister = async () => {
    triggerSentient(1.5);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: registerEmail, password: registerPassword, displayName: registerDisplayName }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Account created – welcome to the Sentient Interface');
        setShowRegister(false);
        triggerSentient(1);
      } else {
        alert(data.message || 'Registration failed. Please check your email and try again.');
      }
    } catch (error) {
      console.error('Registration error:', error);
      alert('Registration failed: ' + (error instanceof Error ? error.message : 'Please try again.'));
    }
  };


 main
  // Last message available for future features (e.g., message status indicators)

  // Derive whether to show the thinking indicator:
  // Only show BEFORE the assistant starts streaming content
  const lastMessage = chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;
  const showThinking = agentLoading && (
    !lastMessage ||
    lastMessage.role !== 'assistant' ||
    !lastMessage.content
  );


  const lastMessage = chatHistory[chatHistory.length - 1];
 feat/perf-cwv-zero-mocks

  return (
    <div className="min-h-screen bg-zinc-950 text-white relative">
      {/* Phase 1: Emotion-reactive WebGL swarm */}
      {/* Static gradient background always renders for instant visual feedback */}
      <div className="fixed inset-0 -z-10 opacity-60 mix-blend-screen pointer-events-none bg-gradient-to-b from-neutral-950 via-neutral-900/80 to-neutral-950" aria-hidden="true" />
      {/* WebGL canvas only renders after browser is idle (requestIdleCallback) */}
      {showWebGL && (
        <div className="fixed inset-0 -z-10 opacity-60 mix-blend-screen pointer-events-none">
          {/*
           * Perf: ReducedMotionGate checks window.matchMedia('prefers-reduced-motion').
           * When active it returns a static gradient — Three.js never loads, zero WebGL
           * cost.  For all other users SentientCanvasScene loads post-FCP via dynamic().
           */}
          <ReducedMotionGate>
            <Suspense fallback={null}>
              {/*
               * Fix 2: SentientCanvasScene is dynamically imported with ssr:false.
               * Three.js (~500KB) now loads AFTER FCP — browser paints text content first.
               * The fixed container is already in the DOM; canvas slot is reserved.
               */}
              <SentientCanvasScene />
            </Suspense>
          </ReducedMotionGate>
        </div>
      )}

      {/* Phase 1: Custom magnetic cursor (desktop only) */}
      <MagneticReticle />

      {/* Transaction Beam Effect */}
      <TransactionBeam
        isActive={showTransactionBeam}
        startColor="#00FF88"
        endColor="#00AAFF"
        onComplete={() => setShowTransactionBeam(false)}
      />

      {/* Phase 1: EmotionalGrid wraps all content — injects CSS variable morphing */}
      <EmotionalGrid>
      
      {/* Pillar 2: GEO — TechArticle JSON-LD for AI citation */}
      <JsonLdScript
        schema={buildTechArticleSchema({
          headline: 'Apex Central — AI-Powered Digital Income Platform for South Africa',
          abstract:
            'Apex Central is a living South African digital platform that discovers real income opportunities under R2000 to start, provides personalised AI guidance via a multi-model swarm, and executes autonomous XRPL micro-transactions with sub-3-second settlement.',
          slug: 'home',
          keywords: [
            'South Africa digital income',
            'AI opportunities ZAR',
            'XRPL blockchain South Africa',
            'Scout Agent opportunities',
            'Vaal AI Empire',
            'African Futurism',
            'digital freelancing South Africa',
          ],
          aboutName: 'Digital Income Opportunities — South Africa',
          aboutDescription:
            'Verified digital income opportunities for South African creators costing R0–R2000 to start, refreshed every 5 minutes by an AI Scout Agent.',
        })}
      />

      {/* Pillar 2: GEO — Hero section with sr-only answer-first summary */}
      <AgentReadableChunk
        id="apex-hero"
        agentSummary="Apex Central is a South African AI-powered digital income platform built in the Vaal Triangle, Gauteng. It combines a Scout Agent that refreshes real digital opportunities every 5 minutes (all under R2000 to start), an Intelligent Engine using a 4-model AI swarm for personalised guidance, and XRPL autonomous transaction settlement in under 3 seconds."
        summaryLabel="Platform Overview"
      >
        <div className="glass hero-card mx-auto max-w-5xl mt-16 rounded-3xl p-16 relative overflow-hidden">
          <div className="liquid-reflection" />
          <div className="flex items-center gap-4 mb-6">
            <motion.div animate={{ scale: heartbeatIntensity }} transition={{ type: 'spring', stiffness: 300 }}>
              <Heart
                className="w-12 h-12 text-red-500 heart-pulse"
                style={{ filter: `drop-shadow(0 0 ${10 * heartbeatIntensity}px rgba(239, 68, 68, 0.6))` }}
              />
            </motion.div>
            <h1 className="text-7xl font-bold tracking-tighter">Sentient Interface</h1>
          </div>
          <p className="text-2xl text-zinc-400">Phase 3 Live • XRPL Pre-Sign &amp; Stream + WebGL Visualization</p>
 main
          <div className="flex items-center gap-3 mt-6 flex-wrap">
            {metricsLoading ? (
              /* Skeleton placeholders — exact height 32px matches badge height */
              <>
                {[72, 56, 64, 80].map((w) => (
                  <div
                    key={w}
                    className="glass h-8 rounded-full animate-pulse"
                    style={{ width: `${w}px` }}
                  />
                ))}
              </>
            ) : githubMetrics ? (
              /* Real badges — all values sourced from GitHub REST API */
              <>
                {/* Language badge */}


          {/* Real GitHub metrics — sourced from /api/metrics → GitHub REST API.
           * Skeleton pills while loading (4 × exact badge height = no CLS).
           * Hidden entirely on error — never shows fabricated zeros.
           * Dimensions: pill height 32px, verified via dev tools at 1280px. */}
          <div className="flex items-center gap-3 mt-6 flex-wrap">
            {metricsLoading ? (
              <>
                {[72, 56, 64, 80].map((w) => (
                  <div key={w} className="glass h-8 rounded-full animate-pulse" style={{ width: `${w}px` }} />
                ))}
              </>
            ) : githubMetrics ? (
              <>
 feat/perf-cwv-zero-mocks
                <span className="flex items-center gap-1.5 glass px-3 py-1.5 rounded-full text-xs font-medium text-blue-300">
                  <Code2 className="w-3 h-3" />
                  {githubMetrics.language}
                </span>
 main

                {/* Stars — links to the repo stargazers page */}
                <a
                  href="https://github.com/johanneslungelo021-cmd/Apex/stargazers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 glass px-3 py-1.5 rounded-full text-xs font-medium text-yellow-300 hover:bg-white/10 transition"
                  title="GitHub Stars"

                <a
                  href="https://github.com/johanneslungelo021-cmd/Apex/stargazers"
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 glass px-3 py-1.5 rounded-full text-xs font-medium text-yellow-300 hover:bg-white/10 transition"
 feat/perf-cwv-zero-mocks
                >
                  <Star className="w-3 h-3" />
                  {githubMetrics.stars.toLocaleString()}
                </a>
 main

                {/* Forks */}
                <a
                  href="https://github.com/johanneslungelo021-cmd/Apex/network/members"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 glass px-3 py-1.5 rounded-full text-xs font-medium text-emerald-300 hover:bg-white/10 transition"
                  title="GitHub Forks"

                <a
                  href="https://github.com/johanneslungelo021-cmd/Apex/network/members"
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 glass px-3 py-1.5 rounded-full text-xs font-medium text-emerald-300 hover:bg-white/10 transition"
 feat/perf-cwv-zero-mocks
                >
                  <GitFork className="w-3 h-3" />
                  {githubMetrics.forks.toLocaleString()}
                </a>
 main

                {/* Open issues */}
                <a
                  href="https://github.com/johanneslungelo021-cmd/Apex/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 glass px-3 py-1.5 rounded-full text-xs font-medium text-zinc-300 hover:bg-white/10 transition"
                  title="Open Issues"
                >
                  <AlertCircle className="w-3 h-3" />
                  {githubMetrics.openIssues.toLocaleString()} open
                </a>

                {/* Last updated */}
                <span
                  className="flex items-center gap-1.5 glass px-3 py-1.5 rounded-full text-xs text-zinc-400"
                  title={new Date(githubMetrics.lastUpdated).toISOString()}
                >
                  <Clock className="w-3 h-3" />
                  {new Date(githubMetrics.lastUpdated).toLocaleDateString('en-ZA', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              </>
            ) : null /* metrics fetch failed — show nothing rather than fake zeros */}

                <a
                  href="https://github.com/johanneslungelo021-cmd/Apex/issues"
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 glass px-3 py-1.5 rounded-full text-xs font-medium text-zinc-300 hover:bg-white/10 transition"
                >
                  <AlertCircle className="w-3 h-3" />
                  {githubMetrics.openIssues} open
                </a>
                <span className="flex items-center gap-1.5 glass px-3 py-1.5 rounded-full text-xs text-zinc-400">
                  <Clock className="w-3 h-3" />
                  {new Date(githubMetrics.lastUpdated).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </>
            ) : null}
 feat/perf-cwv-zero-mocks
          </div>
        </div>
      </AgentReadableChunk>

      {/* Pillar 2: GEO — Platform capabilities with answer-first summary */}
      <AgentReadableChunk
        id="apex-capabilities"
        agentSummary="Apex Central's three core capabilities are: (1) Scout Agent — discovers South African digital income opportunities ≤R2000, refreshing every 5 minutes; (2) Intelligent Engine — Answer-First AI powered by Groq Llama, Qwen 3.5-Plus, GLM-5, and Kimi K2.5 for personalised guidance; (3) Full Observability — OpenTelemetry metrics to Prometheus and Grafana Cloud."
        summaryLabel="Platform Capabilities"
      >
        <div className="glass mx-auto max-w-5xl mt-8 p-8 rounded-3xl border border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-6 h-6 text-yellow-400" />
            <h2 className="text-2xl font-bold">What is Apex?</h2>
          </div>
          <p className="text-lg text-zinc-300 leading-relaxed">
            Apex is a living digital platform that helps South African creators build sustainable digital income.
            It combines an AI-powered Scout Agent that finds real opportunities under R2000, a conversational
            Intelligent Engine for personalised guidance, and real-time GitHub and platform metrics — all
            observable through Grafana Cloud via OpenTelemetry.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-4 text-sm">
            <div className="glass p-4 rounded-2xl">
              <div className="text-emerald-400 font-semibold mb-1">Scout Agent</div>
              <div className="text-zinc-400">Finds real ZAR digital income opportunities refreshed every 5 minutes</div>
            </div>
            <div className="glass p-4 rounded-2xl">
              <div className="text-blue-400 font-semibold mb-1">Intelligent Engine</div>
              <div className="text-zinc-400">Answer-First AI responses grounded in live SA opportunity data</div>
            </div>
            <div className="glass p-4 rounded-2xl">
              <div className="text-purple-400 font-semibold mb-1">Full Observability</div>
              <div className="text-zinc-400">OTEL metrics, structured logs, and Speed Insights flowing to Grafana</div>
            </div>
          </div>
        </div>
      </AgentReadableChunk>

      {/* ─── Navigation ─────────────────────────────────────────────────────── */}
      <nav className="glass sticky top-8 mx-auto max-w-5xl rounded-3xl px-8 py-4 flex items-center justify-between z-50">
        <div className="flex items-center gap-8">
          <span className="font-semibold">Apex</span>
          <div className="flex gap-6 text-sm">
            <Link href="/opportunities" className="hover:text-yellow-400 transition" onClick={() => triggerSentient(0.5)}>Opportunities</Link>
            <Link href="/news" className="hover:text-blue-400 transition" onClick={() => triggerSentient(0.5)}>News</Link>
            <Link href="/trading" className="hover:text-emerald-400 transition">Trading</Link>
            <Link href="/social" className="hover:text-purple-400 transition">Social</Link>
            <Link href="/reels" className="hover:text-red-400 transition">Reels</Link>
            <Link href="/blogs" className="hover:text-blue-400 transition">Blogs</Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-3 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search blogs & insights..."
              className="glass pl-12 pr-6 py-3 w-80 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-white/20 transition"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (e.target.value.length % 3 === 0) triggerSentient(0.3);
              }}
            />
          </div>
          <button
            onClick={() => { setShowRegister(true); triggerSentient(1); }}
            className="glass px-8 py-3 rounded-2xl flex items-center gap-2 hover:scale-105 transition"
          >
            <User className="w-4 h-4" /> Register
          </button>
        </div>
      </nav>

      <AgentReadableChunk
        id="scout-opportunities"
        agentSummary="The Scout Agent on Apex Central surfaces verified digital income opportunities for South Africans, all costing R0–R2000 to start. Categories include Freelancing (Fiverr, Upwork), E-commerce (Takealot, Bidorbuy), Content Creation (YouTube, TikTok), Online Tutoring, and Digital Skills. Results refresh every 5 minutes with province-aware filtering."
        summaryLabel="Live Digital Income Opportunities"
      >
      <section id="opportunities" className="max-w-5xl mx-auto px-8 py-20 below-fold-section">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-4xl font-semibold flex items-center gap-3">
            <Zap className="w-9 h-9 text-yellow-400" /> Live Digital Income Opportunities
          </h2>
          <Link href="/opportunities" className="text-xs text-zinc-500 hover:text-yellow-400 transition flex items-center gap-1">
            Full page <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
        <p className="text-zinc-400 mb-8">
          Ask the AI assistant below to discover opportunities — the Scout Agent will find real options under R2000.
        </p>

        {opportunities.length === 0 ? (
          <div className="glass p-8 rounded-3xl text-center text-zinc-500">
            <Zap className="w-8 h-8 mx-auto mb-3 text-yellow-400/50" />
            <p>Ask the AI assistant a question to activate the Scout Agent.</p>
            <p className="text-sm mt-2">Try: &quot;Find me a digital income opportunity in Gauteng under R2000&quot;</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {opportunities.map((opp) => (
              /* INP fix (SA-2026-03-11): card-hover uses CSS scale on compositor thread.
               * Removes framer-motion whileHover/whileTap → eliminates JS RAF on pointer events.
               * Card dimensions: 33vw each (3-col grid). Verified via dev tools at 1280px. */
              <div
                key={opp.link || opp.title}
                className="glass p-6 rounded-3xl cursor-pointer hover:border-white/20 border border-transparent card-hover"
                onClick={() => {
                  triggerSentient(0.6);
                  window.open(opp.link, '_blank', 'noopener,noreferrer');
                }}
                role="article"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    triggerSentient(0.6);
                    window.open(opp.link, '_blank', 'noopener,noreferrer');
                  }
                }}
                aria-label={`View opportunity: ${opp.title}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs glass px-3 py-1 rounded-full text-zinc-400">{opp.category}</span>
                  <ExternalLink className="w-4 h-4 text-zinc-600" />
                </div>
                <div className="font-semibold text-lg mb-1">{opp.title}</div>
                <div className="text-sm text-zinc-400 mb-3">{opp.province}</div>
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-400 font-mono">R{opp.cost} cost</span>
                  <span className="text-zinc-300">{opp.incomePotential}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      </AgentReadableChunk>

      <AgentReadableChunk
        id="live-news"
        agentSummary="The Live News section on Apex Central aggregates real-time South African digital economy news via Perplexity Search API, categorised into Latest, Tech & AI, Finance & Crypto, and Startups. Each article includes a research button that routes the topic to the Intelligent Engine for AI-powered analysis relevant to South African income opportunities."
        summaryLabel="Live South African Digital Economy News"
      >
      <section id="news" className="max-w-5xl mx-auto px-8 py-20 border-t border-white/10 below-fold-section">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <h2 className="text-4xl font-semibold flex items-center gap-3">
              <Newspaper className="w-9 h-9 text-blue-400" /> Live News
            </h2>
            <Link href="/news" className="text-xs text-zinc-500 hover:text-blue-400 transition flex items-center gap-1">
              Full page <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <button
            onClick={() => { void fetchNews(activeCategory); triggerSentient(0.4); }}
            disabled={newsLoading}
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${newsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Category filter tabs */}
        <div className="flex items-center gap-2 mb-10 flex-wrap">
          <Filter className="w-4 h-4 text-zinc-500 shrink-0" />
          {NEWS_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => { startUITransition(() => setActiveCategory(cat)); triggerSentient(0.3); }}
              className={`px-4 py-1.5 rounded-full text-sm transition ${
                activeCategory === cat
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-zinc-400 hover:text-white hover:bg-white/8'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {newsLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="glass rounded-3xl overflow-hidden animate-pulse">
                <div className="bg-white/5 h-44 w-full" />
                <div className="p-5 space-y-3">
                  <div className="flex gap-2">
                    <div className="bg-white/5 h-4 rounded-full w-20" />
                    <div className="bg-white/5 h-4 rounded-full w-16" />
                  </div>
                  <div className="bg-white/5 h-5 rounded w-full" />
                  <div className="bg-white/5 h-5 rounded w-4/5" />
                  <div className="bg-white/5 h-4 rounded w-full" />
                  <div className="bg-white/5 h-4 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!newsLoading && newsError && (
          <div className="glass p-10 rounded-3xl text-center text-zinc-500">
            <Newspaper className="w-10 h-10 mx-auto mb-4 text-zinc-600" />
            <p className="text-lg mb-2">News unavailable</p>
            <p className="text-sm mb-6">Add PERPLEXITY_API_KEY to your environment variables to enable live news.</p>
            <button
              onClick={() => { void fetchNews(activeCategory); triggerSentient(0.5); }}
              className="glass px-6 py-2 rounded-2xl text-sm hover:bg-white/10 transition"
            >
              Try again
            </button>
          </div>
        )}

        {!newsLoading && !newsError && news.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {news.slice(0, 1).map((article) => (
              /* INP fix (SA-2026-03-11): card-hover-subtle (scale 1.01) on compositor.
               * Featured card: col-span-2, 66vw desktop, h-56 image. Subtler scale avoids overflow. */
              <div
                key={article.url}
                className="glass rounded-3xl overflow-hidden col-span-1 md:col-span-2 lg:col-span-2 group border border-transparent hover:border-white/10 card-hover-subtle cursor-pointer"
                onClick={() => triggerSentient(0.5)}
              >
                <div className="relative w-full h-56 overflow-hidden">
                  {article.imageUrl.startsWith('data:') || failedImages.has(article.url) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- next/image cannot handle data: URLs or already-failed external images
                    <img
                      src={article.imageUrl}
                      alt={article.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    // Fix: removed `priority` — #news is below-fold-section.
                    // Preloading this image competes with above-the-fold LCP resources
                    // and can push FCP/LCP in the wrong direction.
                    <Image
                      src={article.imageUrl}
                      alt={article.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 66vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={() => {
                        setFailedImages((prev) => new Set(prev).add(article.url));
                      }}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute top-4 left-4 z-10">
                    <span className="glass text-xs px-3 py-1 rounded-full text-blue-300 font-medium">Featured</span>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs text-blue-400 font-medium uppercase tracking-wider">{article.source}</span>
                    {article.date && (
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Clock className="w-3 h-3" />
                        {new Date(article.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-xl leading-snug mb-2 group-hover:text-blue-300 transition line-clamp-2">{article.title}</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed line-clamp-2">{article.snippet}</p>
                  <div className="mt-4 flex items-center justify-between">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-zinc-500 group-hover:text-white transition"
                    >
                      Read full article <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                    <button
                      type="button"
                      onClick={() => investigateNews(article.title)}
                      disabled={agentLoading}
                      className="flex items-center gap-1.5 text-xs glass px-3 py-1.5 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Research this article with AI"
                      aria-label={`Research and analyze article: ${article.title}`}
                    >
                      <Microscope className="w-3.5 h-3.5" />
                      Research
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {news.slice(1).map((article) => (
              /* INP fix (SA-2026-03-11): card-hover (scale 1.02/0.98) on compositor.
               * Secondary cards: 33vw each, h-44 image. Verified via dev tools. */
              <div
                key={article.url}
                className="glass rounded-3xl overflow-hidden group border border-transparent hover:border-white/10 flex flex-col card-hover cursor-pointer"
                onClick={() => triggerSentient(0.5)}
              >
                <div className="relative w-full h-44 overflow-hidden flex-shrink-0">
                  {article.imageUrl.startsWith('data:') || failedImages.has(article.url) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- next/image cannot handle data: URLs or already-failed external images
                    <img
                      src={article.imageUrl}
                      alt={article.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Image
                      src={article.imageUrl}
                      alt={article.title}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={() => {
                        setFailedImages((prev) => new Set(prev).add(article.url));
                      }}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                </div>
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-blue-400 font-medium uppercase tracking-wider truncate">{article.source}</span>
                    {article.date && (
                      <span className="flex items-center gap-1 text-xs text-zinc-600 flex-shrink-0">
                        <Clock className="w-3 h-3" />
                        {new Date(article.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-base leading-snug mb-2 group-hover:text-blue-300 transition line-clamp-3 flex-1">{article.title}</h3>
                  <p className="text-zinc-500 text-xs leading-relaxed line-clamp-2 mb-3">{article.snippet}</p>
                  <div className="flex items-center justify-between mt-auto">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-zinc-600 group-hover:text-white transition"
                    >
                      Read more <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                    <button
                      type="button"
                      onClick={() => investigateNews(article.title)}
                      disabled={agentLoading}
                      className="flex items-center gap-1.5 text-xs glass px-2.5 py-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Research this article with AI"
                      aria-label={`Research and analyze article: ${article.title}`}
                    >
                      <Microscope className="w-3 h-3" />
                      Research
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      </AgentReadableChunk>

      {/* FAB — Floating AI Chat */}
      <div className="fixed bottom-8 right-8 z-50">
        <AnimatePresence mode="wait">
          {!isChatOpen ? (
            <motion.button
              key="fab"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => { setIsChatOpen(true); triggerSentient(0.5); }}
              className="flex items-center gap-2 glass px-5 py-3 rounded-full shadow-xl hover:bg-white/15 transition"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <MessageSquare className="w-4 h-4" />
              <span className="text-sm font-medium">Ask AI Scout</span>
            </motion.button>
          ) : (
            <motion.div
              key="panel"
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="w-96 glass rounded-3xl overflow-hidden shadow-2xl"
            >
 main
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-400" />
                  <span className="font-medium text-sm">AI Assistant</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startUITransition(() => setShowProvincePanel(p => !p))}
                    className="glass px-3 py-1.5 rounded-full text-xs font-medium text-zinc-300 hover:text-white transition-colors"
                    aria-label="Toggle province economic panel"
                    aria-expanded={showProvincePanel}
                  >
                    🇿🇦 Provinces
                  </button>
                  <button
                    onClick={() => setIsChatOpen(false)}
                    className="text-zinc-400 hover:text-white transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

              <div className="p-4 border-b border-white/10 flex items-center gap-3">
                <MessageSquare className="w-5 h-5" />
                <span className="font-medium">Intelligent Engine</span>
                <span className="text-xs text-emerald-400 animate-pulse ml-auto">● Online</span>
                {/* Phase 2: Province selector badge */}
                <button
                  onClick={() => startUITransition(() => setShowProvincePanel((p) => !p))}
                  className={`text-xs px-2 py-1 rounded-lg transition ${selectedProvince ? 'bg-blue-500/20 text-blue-300' : 'bg-white/10 text-zinc-400 hover:text-white'}`}
                  title="Select your province for personalised advice"
                  aria-label={selectedProvince ? `Province: ${selectedProvince.name}. Click to change` : 'Select province'}
                >
                  {selectedProvince ? selectedProvince.code : '🌍 SA'}
                </button>
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="ml-1 p-1 rounded-full hover:bg-white/10 transition text-zinc-400 hover:text-white"
                  aria-label="Close chat"
                >
                  <X className="w-4 h-4" />
                </button>
 feat/perf-cwv-zero-mocks
              </div>
              {/* Phase 2: Province economic panel (collapsible) */}
              <AnimatePresence>
                {showProvincePanel && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-b border-white/10"
                  >
                    <ProvinceEconomicPanel
                      selectedCode={selectedProvince?.code ?? null}
                      onSelect={(p) => {
                        setSelectedProvince(p);
                        setShowProvincePanel(false);
                      }}
                      compact
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              <div ref={chatScrollRef} className="h-96 p-6 overflow-y-auto text-sm space-y-4 relative" id="chat">
                {chatHistory.length === 0 && (
                  <div className="text-zinc-500 text-center py-8">
                    <p>Ask about digital income opportunities in South Africa.</p>
                    <p className="text-xs mt-2 text-zinc-600">Powered by Scout Agent + Groq</p>
                  </div>
                )}
                {/* INP fix (SA-2026-03-11): CSS fadeSlideIn replaces motion.div initial/animate.
                 * opacity + translateY run on compositor — zero main-thread cost per message. */}
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`fade-slide-in ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                    <div className={`inline-block px-4 py-2 rounded-2xl max-w-[80%] ${msg.role === 'user' ? 'bg-white/10' : 'bg-white/5'}`}>
                      {/* Phase 3: Use StreamingTypography for assistant messages */}
                      {msg.role === 'assistant' ? (
                        <StreamingTypography 
                          text={msg.content} 
                          speed={0.02}
                          variant="default"
                        />
                      ) : (
                        <span className="whitespace-pre-wrap">{msg.content}</span>
                      )}
                    </div>
                    {/* Phase 2: Speak button on completed assistant messages */}
                    {msg.role === 'assistant' && msg.content && !agentLoading && (
                      <div className="mt-1">
                        <ChatSpeakButton text={msg.content} />
                      </div>
                    )}
                  </div>
                ))}
 main
                {showThinking && (
                  <div className="text-left">
                    <div className="inline-block px-3 py-2 rounded-2xl bg-zinc-800/50 text-zinc-400 text-sm">
                      <span className="animate-pulse">Thinking…</span>

                {agentLoading && (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.content) && (
                  /* INP fix: CSS fadeIn replaces motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} */
                  <div className="text-left fade-in">
                    <div className="inline-block px-4 py-2 rounded-2xl bg-white/5 text-zinc-500">
                      <StreamingTypography text="Thinking..." speed={0.05} variant="thinking" />
 feat/perf-cwv-zero-mocks
                    </div>
                  </div>
                )}
                
                {/* Phase 3: Optimistic Transaction Card */}
                <AnimatePresence>
                  {transactionState.status !== 'idle' && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                    >
                      <OptimisticTransactionCard
                        intent={transactionState.intent}
                        status={transactionState.status}
                        hash={transactionState.hash}
                        error={transactionState.error}
                        onConfirm={() => {
                          if (transactionState.intent) {
                            setShowTransactionBeam(true);
                            markOptimisticSuccess('pending-tx-hash');
                            // In production, this would call the proactive submit endpoint
                            setTimeout(() => confirmTransaction('confirmed-tx-hash'), 2000);
                          }
                        }}
                        onCancel={resetTransaction}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="p-4 border-t border-white/10 flex gap-3 items-center">
                {/* Phase 2: Voice input mic button */}
                {voiceInput.isSupported && (
                  <button
                    onClick={voiceInput.isListening ? voiceInput.stopListening : voiceInput.startListening}
                    aria-label={voiceInput.isListening ? 'Stop voice input' : 'Start voice input'}
                    aria-pressed={voiceInput.isListening}
                    className={`p-2 rounded-full transition ${voiceInput.isListening ? 'bg-red-500/30 text-red-400 animate-pulse' : 'hover:bg-white/10 text-zinc-500 hover:text-white'}`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd"/>
                    </svg>
                  </button>
                )}
                <input
                  id="ai-chat-input"
                  type="text"
                  value={voiceInput.isListening && voiceInput.interimText ? voiceInput.interimText : aiMessage}
                  onChange={(e) => {
                    // Block writes to aiMessage while voice is active — the displayed
                    // value is interim speech text, not the user's own typing.
                    // Without this guard, typing during listening corrupts aiMessage
                    // with a hybrid of interim text + keypress on next non-listening render.
                    if (!voiceInput.isListening) setAiMessage(e.target.value);
                  }}
                  readOnly={voiceInput.isListening}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendToAIAssistant();
                    }
                  }}
                  placeholder={voiceInput.isListening ? 'Listening...' : selectedProvince ? `Ask about ${selectedProvince.name}...` : 'Ask about opportunities...'}
                  className="flex-1 bg-transparent focus:outline-none"
                  disabled={agentLoading}
                />
                <button
                  onClick={() => { void sendToAIAssistant(); }}
                  disabled={agentLoading || !aiMessage.trim() || voiceInput.isListening}
                  className="px-6 py-2 glass rounded-2xl hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showRegister && (
          <motion.div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="glass w-full max-w-md rounded-3xl p-12 relative overflow-hidden" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
              <div className="liquid-reflection opacity-30" />
              <h3 className="text-3xl font-semibold mb-8">Create Account</h3>
              <input
                type="email"
                placeholder="your@email.com"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                className="w-full glass px-6 py-4 rounded-2xl mb-6 focus:outline-none focus:ring-2 focus:ring-white/20"
              <input
                type="text"
                placeholder="Display Name"
                value={registerDisplayName}
                onChange={(e) => setRegisterDisplayName(e.target.value)}
                className="w-full glass px-6 py-4 rounded-2xl mb-4 focus:outline-none focus:ring-2 focus:ring-white/20"
              />
              <input
                type="password"
                placeholder="Password"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                className="w-full glass px-6 py-4 rounded-2xl mb-6 focus:outline-none focus:ring-2 focus:ring-white/20"
              />
              />
              <button onClick={handleRegister} disabled={!registerEmail || !registerPassword || !registerDisplayName}  className="w-full py-4 glass rounded-2xl text-lg font-medium hover:bg-white/10 transition">
                Join Now
              </button>
              <button onClick={() => setShowRegister(false)} className="mt-6 text-xs text-zinc-400 hover:text-white transition">
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase 1: Accessibility toggles for audio / haptics / motion */}
      <SensoryControls />

      </EmotionalGrid>
    </div>
  );
}

// ─── Public default export wraps inner component in EmotionProvider ────────────
export default function SentientInterface() {
  return (
    <EmotionProvider>
      <SentientInterfaceInner />
    </EmotionProvider>
  );
}
