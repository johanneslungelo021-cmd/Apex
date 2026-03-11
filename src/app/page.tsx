/**
 * Sentient Interface - Main Landing Page (Phase 1 — Sentient Vessel)
 *
 * Phase 1 wraps the existing functional content in the Emotion Engine symbiote:
 * EmotionalSwarm (reactive WebGL), EmotionalGrid (CSS variable morphing),
 * MagneticReticle (custom cursor physics), SensoryControls (accessibility toggles).
 *
 * @module app/page
 */

'use client';

import { useState, useEffect, useCallback, useRef, Suspense, useTransition } from 'react';
import { Heart, Search, User, MessageSquare, Zap, ExternalLink, Newspaper, Clock, RefreshCw, Microscope, Filter, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// Canvas dynamically imported below — removed from critical bundle (Fix 2)
import {
  useOptimisticTransaction,
  type TransactionIntent,
} from '@/lib/streaming/OptimisticTransactionUI';

// Dynamic import for heavy streaming UI components — not needed for first paint
const TransactionBeam = dynamic(
  () => import('@/lib/streaming/OptimisticTransactionUI').then((mod) => ({ default: mod.TransactionBeam })),
  { ssr: false, loading: () => null }
);
const StreamingTypography = dynamic(
  () => import('@/lib/streaming/OptimisticTransactionUI').then((mod) => ({ default: mod.StreamingTypography })),
  { ssr: false, loading: () => null }
);

// Phase 1: Sentient Vessel imports
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
import { type ProvinceProfile } from '@/lib/sa-context/provinces';

// Dynamic imports for chat components — not needed for first paint
const ProvinceEconomicPanel = dynamic(
  () => import('@/components/chat/ProvinceEconomicPanel'),
  { ssr: false, loading: () => null }
);

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

// ─── Inner page that consumes EmotionProvider context ─────────────────────────
function SentientInterfaceInner() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [registerEmail, setRegisterEmail] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());


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
  // Hook is called for side effects (callback sets aiMessage)
  const _voiceInput = useVoiceInput((transcript) => {
    setAiMessage(transcript);
  });
  void _voiceInput; // Intentionally unused - hook registers callback
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
    // transactionState and resetTransaction are available for future use
    transactionState: _transactionState,
    resetTransaction: _resetTransaction,
    startTransaction,
    markOptimisticSuccess,
    confirmTransaction,
    failTransaction,
  } = useOptimisticTransaction();
  void _transactionState; // Available for transaction status UI
  void _resetTransaction; // Available for transaction reset
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

  // Re-fetch immediately whenever the user switches categories.
  useEffect(() => {
    void fetchNews(activeCategory);
  }, [activeCategory, fetchNews]);

  useEffect(() => {
    if (isChatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [isChatOpen, chatHistory]);

  const sendToAIAssistant = useCallback(async (promptOverride?: string) => {
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

  // On mount: auto-boot Scout Agent so opportunities section is never empty
  useEffect(() => {
    const timer = setTimeout(() => {
      void sendToAIAssistant('Find me 3 top digital income opportunities in South Africa under R2000 to start right now');
    }, 1800); // slight delay so chat history doesn't flash on first render
    return () => { clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount — sendToAIAssistant is stable

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
        body: JSON.stringify({ email: registerEmail }),
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


  // Last message available for future features (e.g., message status indicators)
  const _lastMessage = chatHistory[chatHistory.length - 1];
  void _lastMessage; // Reserved for message-level features

  return (
    <div className="min-h-screen bg-zinc-950 text-white relative">
      {/* Phase 1: Emotion-reactive WebGL swarm */}
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

      {/* Phase 1: Custom magnetic cursor (desktop only) */}
      <MagneticReticle />

      {/* Transaction Beam Effect */}
      {showTransactionBeam && (
        <TransactionBeam
          isActive={showTransactionBeam}
          startColor="#00FF88"
          endColor="#00AAFF"
          onComplete={() => setShowTransactionBeam(false)}
        />
      )}

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
        <div className="glass mx-auto max-w-5xl mt-16 rounded-3xl p-16 relative overflow-hidden">
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
          <div className="flex items-center gap-4 mt-6">

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
              <motion.div
                key={opp.link || opp.title}
                className="glass p-6 rounded-3xl cursor-pointer hover:border-white/20 border border-transparent transition"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
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
              </motion.div>
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
              <motion.div
                key={article.url}
                className="glass rounded-3xl overflow-hidden col-span-1 md:col-span-2 lg:col-span-2 group border border-transparent hover:border-white/10 transition"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
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
                    >
                      <Microscope className="w-3.5 h-3.5" />
                      Research
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}

            {news.slice(1).map((article) => (
              <motion.div
                key={article.url}
                className="glass rounded-3xl overflow-hidden group border border-transparent hover:border-white/10 transition flex flex-col"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
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
                  <h3 className="font-semibold text-base leading-snug mb-2 group-hover:text-blue-300 transition line-clamp-2">{article.title}</h3>
                  <p className="text-zinc-500 text-sm leading-relaxed line-clamp-2 flex-1">{article.snippet}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-500 hover:text-white transition"
                    >
                      Read <ExternalLink className="w-3 h-3 inline ml-0.5" />
                    </a>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); investigateNews(article.title); }}
                      disabled={agentLoading}
                      className="text-xs text-zinc-400 hover:text-white transition disabled:opacity-40"
                    >
                      <Microscope className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>
      </AgentReadableChunk>

      {/* ─── AI Assistant Chat Panel ───────────────────────────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="glass w-96 h-[32rem] rounded-3xl flex flex-col overflow-hidden border border-white/10"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-400" />
                  <span className="font-medium text-sm">AI Assistant</span>
                </div>
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="text-zinc-400 hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatHistory.length === 0 && (
                  <div className="text-center text-zinc-500 text-sm py-8">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
                    <p>Ask about digital income opportunities in South Africa</p>
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <div
                    key={i}
                    className={`${msg.role === 'user' ? 'text-right' : 'text-left'}`}
                  >
                    <div
                      className={`inline-block max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
                        msg.role === 'user'
                          ? 'bg-blue-500/20 text-blue-100'
                          : 'bg-zinc-800/50 text-zinc-200'
                      }`}
                    >
                      {msg.role === 'assistant' && StreamingTypography ? (
                        <StreamingTypography text={msg.content} speed={0.02} variant="default" />
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))}
                {agentLoading && (
                  <div className="text-left">
                    <div className="inline-block px-3 py-2 rounded-2xl bg-zinc-800/50 text-zinc-400 text-sm">
                      <span className="animate-pulse">Thinking...</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Ask about opportunities..."
                    className="flex-1 bg-zinc-800/50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                    value={aiMessage}
                    onChange={(e) => setAiMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void sendToAIAssistant();
                      }
                    }}
                  />
                  <button
                    onClick={() => void sendToAIAssistant()}
                    disabled={agentLoading || !aiMessage.trim()}
                    className="bg-blue-500/20 text-blue-300 px-3 py-2 rounded-xl text-sm hover:bg-blue-500/30 transition disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat toggle button */}
        <motion.button
          onClick={() => { setIsChatOpen(!isChatOpen); triggerSentient(0.5); }}
          className="glass w-14 h-14 rounded-2xl flex items-center justify-center hover:scale-105 transition"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <MessageSquare className="w-6 h-6 text-blue-400" />
        </motion.button>
      </div>

      {/* Province Economic Panel */}
      <AnimatePresence>
        {showProvincePanel && ProvinceEconomicPanel && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            className="fixed top-20 right-6 z-40"
          >
            <ProvinceEconomicPanel
              selectedCode={selectedProvince?.code ?? null}
              onSelect={(province: ProvinceProfile) => {
                setSelectedProvince(province);
                setShowProvincePanel(false);
              }}
              compact={false}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Register Modal */}
      <AnimatePresence>
        {showRegister && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowRegister(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass p-8 rounded-3xl w-full max-w-md border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold mb-4">Create Account</h2>
              <p className="text-zinc-400 mb-6">Join the Apex Central community</p>
              <input
                type="email"
                placeholder="Email address"
                className="w-full bg-zinc-800/50 rounded-xl px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRegister(false)}
                  className="flex-1 glass px-4 py-3 rounded-xl text-sm hover:bg-white/10 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRegister}
                  disabled={!registerEmail.trim()}
                  className="flex-1 bg-blue-500/20 text-blue-300 px-4 py-3 rounded-xl text-sm hover:bg-blue-500/30 transition disabled:opacity-40"
                >
                  Register
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      </EmotionalGrid>

      {/* Sensory Controls — accessibility toggles (bottom-left, fixed) */}
      <div className="fixed bottom-6 left-6 z-50">
        {SensoryControls && <SensoryControls />}
      </div>
    </div>
  );
}

// ─── Page wrapper with EmotionProvider ────────────────────────────────────────

export default function Page() {
  return (
    <EmotionProvider>
      <SentientInterfaceInner />
    </EmotionProvider>
  );
}
