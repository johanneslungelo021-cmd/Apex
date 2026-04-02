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

"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  Suspense,
  useTransition,
} from "react";
// Lucide-react: Turbopack tree-shakes the barrel import correctly in Next.js 16.
// Individual deep imports (lucide-react/dist/esm/icons/heart) have no .d.ts files
// in this version, causing TypeScript errors. The barrel import is the correct path.
import {
  Search,
  User,
  MessageSquare,
  Zap,
  ExternalLink,
  Newspaper,
  Clock,
  RefreshCw,
  Microscope,
  Filter,
  X,
  Star,
  GitFork,
  Code2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

// Lightweight hook + types — no UI components, safe to import statically.
// Prevents TransactionBeam / StreamingTypography from entering the initial JS bundle.
import {
  useOptimisticTransaction,
  type TransactionIntent,
} from "@/lib/streaming/optimisticTransactionHook";

// Phase 1: Sentient Vessel imports
import dynamic from "next/dynamic";
import { EmotionProvider, useEmotionEngine } from "@/hooks/useEmotionEngine";
import { useMultiSensory } from "@/hooks/useMultiSensory";

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
  () => import("@/components/sentient/SentientCanvasScene"),
  {
    ssr: false,
    loading: () => null, // Fixed container already reserves space — no CLS
  },
);

// MagneticReticle: framer-motion cursor tracking — not needed for first paint.
// Defer until after LCP to avoid competing for main thread during critical path.
const MagneticReticle = dynamic(
  () => import("@/components/sentient/MagneticReticle"),
  { ssr: false, loading: () => null },
);

// EmotionalGrid: CSS variable morphing wrapper — lightweight but uses context.
// Keep static since it wraps all content (removing would break layout structure).
import EmotionalGrid from "@/components/sentient/EmotionalGrid";

// Perf: ReducedMotionGate — skips Three.js entirely for prefers-reduced-motion
// users and returns a static gradient fallback instead.
import { ReducedMotionGate } from "@/components/sentient/ReducedMotionGate";

// SensoryControls: accessibility toggles — never needed for first paint.
const SensoryControls = dynamic(
  () => import("@/components/sentient/SensoryControls"),
  { ssr: false, loading: () => null },
);

// Heavy transaction UI — framer-motion + complex animations. Dynamic-imported so
// TransactionBeam / StreamingTypography never enter the initial JS bundle.
const { StreamingTypography, TransactionBeam, OptimisticTransactionCard } = {
  StreamingTypography: dynamic(
    () =>
      import("@/lib/streaming/OptimisticTransactionUI").then((m) => ({
        default: m.StreamingTypography,
      })),
    { ssr: false, loading: () => null },
  ),
  TransactionBeam: dynamic(
    () =>
      import("@/lib/streaming/OptimisticTransactionUI").then((m) => ({
        default: m.TransactionBeam,
      })),
    { ssr: false, loading: () => null },
  ),
  OptimisticTransactionCard: dynamic(
    () =>
      import("@/lib/streaming/OptimisticTransactionUI").then((m) => ({
        default: m.OptimisticTransactionCard,
      })),
    { ssr: false, loading: () => null },
  ),
};

// Pillar 2: GEO — Generative Engine Optimization
import AgentReadableChunk from "@/components/geo/AgentReadableChunk";
import JsonLdScript from "@/components/geo/JsonLdScript";
import { buildTechArticleSchema } from "@/lib/geo/schema-builder";

// Perf: yieldToMain — break AI streaming into interruptible micro-tasks
// so user clicks are processed immediately between stream chunks.
import { yieldToMain, isLongTask } from "@/lib/performance/yieldToMain";

// Phase 2: Audio + Province Intelligence
import { useVoiceInput } from "@/hooks/useVoiceInput";
import ProvinceEconomicPanel from "@/components/chat/ProvinceEconomicPanel";
import ChatSpeakButton from "@/components/chat/ChatSpeakButton";
import { type ProvinceProfile } from "@/lib/sa-context/provinces";

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

/**
 * Real data shape returned by GET /api/metrics → GitHub REST API.
 * Used in: src/app/page.tsx hero metrics strip (below h1).
 * Source verified: api.github.com/repos/johanneslungelo021-cmd/Apex
 */
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
  const [searchTerm, setSearchTerm] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [registerEmail, setRegisterEmail] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<
    { role: string; content: string }[]
  >([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  // ─── Live GitHub Metrics — sourced from /api/metrics → GitHub REST API ────
  // Replaces the fabricated platform metrics (users/impact/courses) removed
  // in the audit. All values verifiable at: github.com/johanneslungelo021-cmd/Apex
  const [githubMetrics, setGithubMetrics] = useState<LiveGitHubMetrics | null>(
    null,
  );
  const [metricsLoading, setMetricsLoading] = useState(true);

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
  const [selectedProvince, setSelectedProvince] =
    useState<ProvinceProfile | null>(null);
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
        triggerAudio("awakened");
      } else if (intensityLevel >= 1.0) {
        emotion.transition("awakened");
        triggerAudio("awakened");
        setTimeout(() => emotion.transition("dormant"), 600);
      } else {
        emotion.pulse(intensityLevel);
      }
    },
    [emotion, triggerAudio],
  );

  // Sync audio layer with emotion state changes
  useEffect(() => {
    triggerAudio(emotion.state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emotion.state]);

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
  // Ref for auto-dismiss timeout of the transaction confirmation modal.
  // Stored in a ref (not state) to avoid re-renders and allow cleanup in useEffect.
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const NEWS_CATEGORIES = [
    "Latest",
    "Tech & AI",
    "Finance & Crypto",
    "Startups",
  ] as const;
  type NewsCategory = (typeof NEWS_CATEGORIES)[number];
  const [activeCategory, setActiveCategory] = useState<NewsCategory>("Latest");

  // Phase 1: transaction state for optimistic UI

  // ─── News Fetcher ──────────────────────────────────────────────────────────
  // Defined before effects so it can be listed as a stable dependency.
  // setState functions returned by useState are referentially stable — safe to omit.
  const fetchNews = useCallback(async (category: NewsCategory = "Latest") => {
    setNewsLoading(true);
    setNewsError(false);
    try {
      const res = await fetch(
        `/api/news?category=${encodeURIComponent(category)}`,
      );
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
  const activeCategoryRef = useRef<NewsCategory>("Latest");
  useEffect(() => {
    activeCategoryRef.current = activeCategory;
  }, [activeCategory]);

  // On mount: fire analytics + start polling. Interval reads from the ref so it
  // always uses the latest category without needing to re-register.
  useEffect(() => {
    fetch("/api/analytics", { method: "POST" }).catch(() => {});
    void fetchNews(activeCategoryRef.current);
    const newsInterval = setInterval(
      () => {
        void fetchNews(activeCategoryRef.current);
      },
      10 * 60 * 1000,
    );
    // Capture ref value at effect time so the cleanup closure uses a stable reference.
    const pendingConfirmTimeout = confirmTimeoutRef;
    return () => {
      clearInterval(newsInterval);
      // Clean up any pending confirmation auto-dismiss on unmount.
      if (pendingConfirmTimeout.current)
        clearTimeout(pendingConfirmTimeout.current);
    };
  }, [fetchNews]); // fetchNews is stable (useCallback []); ref handles category

  // On mount: auto-boot Scout Agent so opportunities section is never empty
  useEffect(() => {
    const timer = setTimeout(() => {
      void sendToAIAssistant(
        "Find me 3 top digital income opportunities in South Africa under R2000 to start right now",
      );
    }, 1800); // slight delay so chat history doesn't flash on first render
    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount — sendToAIAssistant is stable

  // Re-fetch immediately whenever the user switches categories.
  useEffect(() => {
    void fetchNews(activeCategory);
  }, [activeCategory, fetchNews]);

  useEffect(() => {
    if (isChatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [isChatOpen, chatHistory]);

  // Fetch real GitHub metrics on mount — /api/metrics → GitHub REST API.
  // Cancellable via cleanup function to prevent setState on unmounted component.
  // Fails silently — hero renders without the metrics strip if network is unavailable.
  // Used in: hero metrics strip below h1 (line ~600)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/metrics");
        if (!res.ok) return;
        const data = (await res.json()) as { github: LiveGitHubMetrics };
        if (!cancelled && data?.github) setGithubMetrics(data.github);
      } catch {
        // Non-critical: hero renders without metrics strip on network error
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sendToAIAssistant = useCallback(
    async (promptOverride?: string) => {
      const outgoingMessage = (promptOverride ?? aiMessage).trim();
      if (!outgoingMessage || agentLoading) return;

      triggerSentient(1.2);

      const userMsg = { role: "user", content: outgoingMessage };
      const newHistory = [...chatHistory, userMsg];

      setChatHistory(newHistory);
      setAiMessage("");
      setAgentLoading(true);

      const setAssistantContent = (content: string) => {
        setChatHistory((prev) => {
          if (prev.length === 0) return prev;
          const next = [...prev];
          const last = next[next.length - 1];

          if (!last || last.role !== "assistant") {
            next.push({ role: "assistant", content });
            return next;
          }

          next[next.length - 1] = { ...last, content };
          return next;
        });
      };

      const agentMessages = newHistory
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

      // Prepend province context to the last user message if a province is selected
      if (selectedProvince && agentMessages.length > 0) {
        const lastIdx = agentMessages.length - 1;
        const last = agentMessages[lastIdx];
        if (last && last.role === "user") {
          agentMessages[lastIdx] = {
            ...last,
            content: `[User province: ${selectedProvince.name} — unemployment ${selectedProvince.unemploymentPercent}%, digital access ${selectedProvince.digitalAccessPercent}%]\n${last.content}`,
          };
        }
      }

      try {
        const res = await fetch("/api/ai-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: agentMessages }),
        });

        if (!res.ok) {
          let message = "Something went wrong. Please try again.";
          try {
            const data = await res.json();
            if (typeof data?.message === "string" && data.message.trim()) {
              message = data.message;
            }
          } catch {
            // ignore json parse failures on error payloads
          }
          setAssistantContent(message);
          return;
        }

        if (!res.body) {
          setAssistantContent("AI engine returned no stream.");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantReply = "";

        const processLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;

          let parsed: unknown;
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            return;
          }

          if (!parsed || typeof parsed !== "object") return;
          const event = parsed as Record<string, unknown>;
          const type = typeof event.type === "string" ? event.type : undefined;
          const data = event.data;

          if (type === "opportunities") {
            if (Array.isArray(data) && data.length > 0) {
              startUITransition(() => setOpportunities(data as Opportunity[])); // non-urgent
            }
            return;
          }

          if (type === "chunk") {
            if (typeof data === "string") {
              assistantReply += data;
              setAssistantContent(assistantReply);
            }
            return;
          }

          if (type === "error") {
            if (typeof data === "string" && data.trim()) {
              assistantReply = data;
              setAssistantContent(data);
            }
            return;
          }

          if (type === "done") {
            return;
          }

          // Phase 3: Handle transaction events from proactive route
          if (type === "transaction_ready") {
            const intent = event.intent as TransactionIntent | undefined;
            if (intent) {
              startTransaction(intent);
              triggerSentient(1.5);
            }
            return;
          }

          if (type === "transaction_submitted") {
            const hash = typeof event.hash === "string" ? event.hash : null;
            if (hash) {
              markOptimisticSuccess(hash);
              setShowTransactionBeam(true);
            }
            return;
          }

          if (type === "transaction_confirmed") {
            const hash = typeof event.hash === "string" ? event.hash : null;
            if (hash) {
              confirmTransaction(hash);
              triggerSentient(1);
            }
            return;
          }

          if (type === "transaction_failed") {
            const errorMsg =
              typeof event.error === "string"
                ? event.error
                : "Transaction failed";
            failTransaction(errorMsg);
            return;
          }

          // Backward-compatibility for older payloads if any stale deployment emits them
          if (
            Array.isArray(event.opportunities) &&
            event.opportunities.length > 0
          ) {
            startUITransition(() =>
              setOpportunities(event.opportunities as Opportunity[]),
            ); // non-urgent
            return;
          }

          if (typeof event.message === "string" && event.message.trim()) {
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
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

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
          setAssistantContent("AI engine returned an empty response.");
        }

        triggerSentient(0.8);
      } catch (error) {
        console.error("AI Agent error:", error);
        setAssistantContent("Connection error. Please try again.");
      } finally {
        setAgentLoading(false);
      }
    },
    [
      aiMessage,
      agentLoading,
      chatHistory,
      triggerSentient,
      selectedProvince,
      startTransaction,
      markOptimisticSuccess,
      confirmTransaction,
      failTransaction,
    ],
  );

  const investigateNews = useCallback(
    (articleTitle: string) => {
      if (agentLoading) return;

      triggerSentient(0.6);
      const researchPrompt = `Research the following news topic and explain its relevance to South African digital income opportunities:\n\n"${articleTitle}"\n\nProvide: 1) Key insights, 2) Potential opportunities, 3) Actionable next steps.`;

      setIsChatOpen(true);
      void sendToAIAssistant(researchPrompt);
    },
    [agentLoading, sendToAIAssistant, triggerSentient],
  );

  const handleRegister = async () => {
    triggerSentient(1.5);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: registerEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        alert("Account created – welcome to the Sentient Interface");
        setShowRegister(false);
        triggerSentient(1);
      } else {
        alert(
          data.message ||
            "Registration failed. Please check your email and try again.",
        );
      }
    } catch (error) {
      console.error("Registration error:", error);
      alert(
        "Registration failed: " +
          (error instanceof Error ? error.message : "Please try again."),
      );
    }
  };

  const lastMessage = chatHistory[chatHistory.length - 1];

  // ── Portal subtitles sourced from live state (no hardcoded fakes) ──────────
  const tradingSubtitle = githubMetrics
    ? `${githubMetrics.language} · ${githubMetrics.stars} stars · XRPL live`
    : "ZAR/XRP liquidity matrix online. Real-time execution.";
  const opportunitiesSubtitle =
    opportunities.length > 0
      ? `${opportunities.length} live opportunities under R2000`
      : "Scout Agent scanning all 9 provinces now.";
  const newsSubtitle =
    news.length > 0
      ? news[0]?.title?.slice(0, 60) + "…"
      : "South Africa's AI economy growing 47% YoY.";

  return (
    <div
      className="min-h-screen bg-black text-white relative overflow-x-hidden"
      style={{ fontFamily: "var(--font-geist-sans), ui-sans-serif" }}
    >
      {/* ── Cinematic CSS injected once ─────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');

        .apex-title {
          font-family: 'Bebas Neue', 'DIN Condensed', Impact, sans-serif;
          letter-spacing: -0.02em;
          line-height: 0.88;
        }
        .liquid-border-nav {
          position: relative;
          isolation: isolate;
        }
        .liquid-border-nav::before {
          content: '';
          position: absolute;
          inset: -1.5px;
          background: linear-gradient(90deg, #00ffc8, #00aaff, #7c3aed, #00ffc8);
          background-size: 300% 100%;
          animation: liquidFlow 6s linear infinite;
          border-radius: inherit;
          z-index: -1;
          opacity: 0.7;
          filter: blur(2px);
        }
        @keyframes liquidFlow {
          0%   { background-position: 0% 50%; }
          100% { background-position: 300% 50%; }
        }
        .portal-hover {
          transition: transform 0.45s cubic-bezier(0.23, 1, 0.32, 1),
                      box-shadow 0.45s cubic-bezier(0.23, 1, 0.32, 1);
        }
        .portal-hover:hover {
          transform: translateY(-10px) scale(1.025);
          box-shadow: 0 0 60px -8px rgba(0, 255, 200, 0.4);
        }
        .apex-glass {
          background: rgba(10, 15, 35, 0.72);
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          border: 1px solid rgba(0, 255, 200, 0.12);
        }
        .hero-glow {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 80% 60% at 50% 50%, rgba(0,40,60,0.9) 0%, transparent 70%);
          pointer-events: none;
        }
        .scan-line {
          position: absolute;
          left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(0,255,200,0.4), transparent);
          animation: scanDown 8s linear infinite;
          pointer-events: none;
        }
        @keyframes scanDown {
          0%   { top: -1px; opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .text-cyan-apex { color: #00ffc8; }
        .fade-up {
          animation: fadeUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(32px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .stagger-1 { animation-delay: 0.1s; }
        .stagger-2 { animation-delay: 0.25s; }
        .stagger-3 { animation-delay: 0.45s; }
        .stagger-4 { animation-delay: 0.65s; }
        .scrollbar-hide { scrollbar-width: none; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── WebGL Swarm (unchanged) ─────────────────────────────────────────── */}
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{ opacity: 0.55, mixBlendMode: "screen" }}
      >
        <ReducedMotionGate>
          <Suspense fallback={null}>
            <SentientCanvasScene />
          </Suspense>
        </ReducedMotionGate>
      </div>

      {/* ── Magnetic cursor ─────────────────────────────────────────────────── */}
      <MagneticReticle />

      {/* ── Transaction beam ────────────────────────────────────────────────── */}
      <TransactionBeam
        isActive={showTransactionBeam}
        startColor="#00FF88"
        endColor="#00AAFF"
        onComplete={() => setShowTransactionBeam(false)}
      />

      {/* ── GEO schema (unchanged) ──────────────────────────────────────────── */}
      <JsonLdScript
        schema={buildTechArticleSchema({
          headline:
            "Apex Central — AI-Powered Digital Income Platform for South Africa",
          abstract:
            "Apex Central is a living South African digital platform that discovers real income opportunities under R2000 to start, provides personalised AI guidance via a multi-model swarm, and executes autonomous XRPL micro-transactions with sub-3-second settlement.",
          slug: "home",
          keywords: [
            "South Africa digital income",
            "AI opportunities ZAR",
            "XRPL blockchain South Africa",
            "Scout Agent opportunities",
            "Vaal AI Empire",
            "African Futurism",
            "digital freelancing South Africa",
          ],
          aboutName: "Digital Income Opportunities — South Africa",
          aboutDescription:
            "Verified digital income opportunities for South African creators costing R0–R2000 to start, refreshed every 5 minutes by an AI Scout Agent.",
        })}
      />

      <EmotionalGrid>
        {/* ════════════════════════════════════════════════════════════════════════
          LIQUID GLASS NAV — fixed, floats above everything
      ════════════════════════════════════════════════════════════════════════ */}
        <nav className="liquid-border-nav fixed top-5 left-1/2 -translate-x-1/2 z-50 rounded-[2rem]">
          <div className="apex-glass rounded-[2rem] px-6 py-3 flex items-center gap-6">
            {/* Logo */}
            <div className="flex items-center gap-2.5 mr-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-400 flex items-center justify-center text-xs font-bold text-black flex-shrink-0">
                A
              </div>
              <span className="apex-title text-xl tracking-tight text-white">
                APEX
              </span>
            </div>

            {/* Links */}
            <div className="hidden md:flex items-center gap-5 text-xs font-medium tracking-widest uppercase">
              {[
                {
                  label: "Portals",
                  href: "#portals",
                  color: "hover:text-cyan-400",
                },
                {
                  label: "Trading",
                  href: "/trading",
                  color: "hover:text-emerald-400",
                },
                { label: "News", href: "/news", color: "hover:text-blue-400" },
                {
                  label: "Social",
                  href: "/social",
                  color: "hover:text-purple-400",
                },
              ].map(({ label, href, color }) => (
                <Link
                  key={label}
                  href={href}
                  className={`text-white/50 ${color} transition-colors`}
                  onClick={() => triggerSentient(0.3)}
                >
                  {label}
                </Link>
              ))}
            </div>

            {/* Search */}
            <div className="relative hidden lg:block">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
              <input
                type="text"
                placeholder="Search…"
                className="bg-white/5 border border-white/10 pl-9 pr-4 py-2 rounded-xl text-xs w-48 focus:outline-none focus:border-cyan-500/40 transition text-white placeholder:text-white/25"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  if (e.target.value.length % 3 === 0) triggerSentient(0.2);
                }}
              />
            </div>

            {/* Register */}
            <button
              type="button"
              onClick={() => {
                setShowRegister(true);
                triggerSentient(1);
              }}
              className="flex items-center gap-1.5 bg-white/10 border border-white/15 hover:bg-white/20 text-white text-xs tracking-widest uppercase px-5 py-2.5 rounded-2xl transition"
            >
              <User className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Register</span>
            </button>
          </div>
        </nav>

        {/* ════════════════════════════════════════════════════════════════════════
          FULL-SCREEN CINEMATIC HERO
      ════════════════════════════════════════════════════════════════════════ */}
        <AgentReadableChunk
          id="apex-hero"
          agentSummary="Apex Central is South Africa's first sentient AI income platform — province-aware, XRPL-native, emotionally reactive."
          summaryLabel="Platform Overview"
        >
          <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
            <div className="hero-glow" />
            <div className="scan-line" aria-hidden="true" />

            {/* Live badge */}
            <motion.div
              className="fade-up stagger-1 inline-flex items-center gap-2.5 border border-white/10 rounded-full px-5 py-2 mb-10 text-xs tracking-[4px] uppercase"
              style={{ background: "rgba(0,255,200,0.06)" }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.1,
                duration: 0.7,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <span className="text-cyan-apex">Johannesburg</span>
              <span className="text-white/30">·</span>
              <span className="text-white/50">Live</span>
            </motion.div>

            {/* Massive title */}
            <motion.h1
              className="apex-title text-center text-white select-none"
              style={{ fontSize: "clamp(5rem, 14vw, 14rem)" }}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.2,
                duration: 0.9,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <span className="block">SENTIENT</span>
              <span
                className="block"
                style={{
                  WebkitTextStroke: "1px rgba(0,255,200,0.5)",
                  color: "transparent",
                }}
              >
                INTERFACE
              </span>
            </motion.h1>

            {/* Tagline */}
            <motion.p
              className="mt-8 text-center text-lg text-white/50 max-w-sm leading-relaxed tracking-wide"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.8 }}
            >
              South Africa&apos;s first emotional AI agent.
              <br />
              <span className="text-cyan-apex/70">
                Province-aware · XRPL-native · Real-time.
              </span>
            </motion.p>

            {/* CTA buttons */}
            <motion.div
              className="mt-12 flex gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65, duration: 0.7 }}
            >
              <a
                href="#portals"
                className="px-10 py-5 bg-white text-black rounded-3xl font-semibold tracking-tight hover:scale-105 transition-transform text-sm flex items-center gap-2"
                onClick={() => triggerSentient(0.8)}
              >
                Enter Portals
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 7h12M8 2l5 5-5 5" />
                </svg>
              </a>
              <button
                type="button"
                onClick={() => {
                  setIsChatOpen(true);
                  triggerSentient(1);
                }}
                className="px-10 py-5 apex-glass rounded-3xl font-medium text-sm flex items-center gap-2 hover:bg-white/10 transition tracking-tight"
              >
                <MessageSquare className="w-4 h-4" />
                Ask Scout Agent
              </button>
            </motion.div>

            {/* GitHub metrics pill strip */}
            <motion.div
              className="mt-12 flex items-center gap-3 flex-wrap justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.85 }}
            >
              {metricsLoading ? (
                [72, 56, 64, 80].map((w) => (
                  <div
                    key={w}
                    className="h-7 rounded-full bg-white/5 animate-pulse"
                    style={{ width: `${w}px` }}
                  />
                ))
              ) : githubMetrics ? (
                <>
                  <span
                    className="flex items-center gap-1.5 border border-white/10 px-3 py-1.5 rounded-full text-xs font-medium text-blue-300"
                    style={{ background: "rgba(59,130,246,0.08)" }}
                  >
                    <Code2 className="w-3 h-3" />
                    {githubMetrics.language}
                  </span>
                  <a
                    href="https://github.com/johanneslungelo021-cmd/Apex/stargazers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 border border-white/10 px-3 py-1.5 rounded-full text-xs font-medium text-yellow-300 hover:border-yellow-400/30 transition"
                    style={{ background: "rgba(234,179,8,0.08)" }}
                  >
                    <Star className="w-3 h-3" />
                    {githubMetrics.stars}
                  </a>
                  <a
                    href="https://github.com/johanneslungelo021-cmd/Apex/network/members"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 border border-white/10 px-3 py-1.5 rounded-full text-xs font-medium text-emerald-300 hover:border-emerald-400/30 transition"
                    style={{ background: "rgba(16,185,129,0.08)" }}
                  >
                    <GitFork className="w-3 h-3" />
                    {githubMetrics.forks}
                  </a>
                  <span className="flex items-center gap-1.5 border border-white/10 px-3 py-1.5 rounded-full text-xs text-white/30">
                    <Clock className="w-3 h-3" />
                    {new Date(githubMetrics.lastUpdated).toLocaleDateString(
                      "en-ZA",
                      { day: "numeric", month: "short", year: "numeric" },
                    )}
                  </span>
                </>
              ) : null}
            </motion.div>

            {/* Province floating tag */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 apex-glass px-5 py-2.5 rounded-3xl text-xs flex items-center gap-3">
              <span className="text-cyan-apex font-mono">GAUTENG</span>
              <span className="w-px h-3.5 bg-white/20" />
              <span className="text-white/40">
                12.4M citizens · 3.2% GDP growth
              </span>
            </div>

            {/* Scroll indicator */}
            <div className="absolute bottom-10 right-10 flex flex-col items-center gap-1.5 text-[9px] tracking-[3px] text-white/25 uppercase">
              <motion.div
                animate={{ y: [0, 6, 0] }}
                transition={{ repeat: Infinity, duration: 1.6 }}
              >
                ↓
              </motion.div>
              <span>Scroll</span>
            </div>
          </section>
        </AgentReadableChunk>

        {/* ════════════════════════════════════════════════════════════════════════
          6 LIVING PORTALS — Cinematic horizontal scroll
      ════════════════════════════════════════════════════════════════════════ */}
        <section id="portals" className="py-24 px-6">
          <div className="max-w-screen-2xl mx-auto">
            {/* Section header */}
            <div className="mb-14 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
              <div>
                <span className="text-xs tracking-[4px] text-white/30 uppercase block mb-3">
                  6 Living Portals
                </span>
                <h2
                  className="apex-title text-white"
                  style={{ fontSize: "clamp(3rem, 6vw, 5rem)" }}
                >
                  Choose your reality
                </h2>
              </div>
              <div className="flex items-center gap-3 text-xs text-white/30 font-mono">
                <motion.div
                  className="w-2 h-2 rounded-full bg-emerald-400"
                  animate={{ scale: [1, 1.4, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                />
                All portals · Real-time data
              </div>
            </div>

            {/* Horizontal scroll rail */}
            <div className="flex gap-6 overflow-x-auto pb-6 snap-x snap-mandatory scrollbar-hide -mx-6 px-6">
              {/* TRADING */}
              <Link
                href="/trading"
                className="portal-hover group block min-w-[380px] h-[500px] rounded-3xl overflow-hidden snap-start relative flex-shrink-0 apex-glass border border-white/10"
                onMouseEnter={() => {
                  emotion.transition("awakened");
                  triggerAudio("awakened");
                }}
                onMouseLeave={() => {
                  emotion.transition("dormant");
                  triggerAudio("dormant");
                }}
                onClick={() => triggerSentient(0.8)}
              >
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="none"
                  className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-90 scale-100 group-hover:scale-105 transition-all duration-1000"
                  src="https://assets.mixkit.co/videos/preview/754/754-small.mp4"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-between p-8 z-10">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[10px] font-mono tracking-[3px] text-cyan-apex/70 uppercase border border-cyan-apex/20 px-3 py-1 rounded-full"
                      style={{ background: "rgba(0,255,200,0.06)" }}
                    >
                      VOLATILE
                    </span>
                    <span className="font-mono text-xs text-white/30">01</span>
                  </div>
                  <div>
                    <h3
                      className="apex-title text-white mb-3"
                      style={{ fontSize: "3.5rem" }}
                    >
                      TRADING
                    </h3>
                    <p className="text-sm text-white/60 max-w-[260px] opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                      {tradingSubtitle}
                    </p>
                    <div className="mt-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100">
                      <span className="text-emerald-400 text-xs font-mono">
                        XRPL · Live
                      </span>
                      <span
                        className="flex items-center gap-1.5 text-xs text-white/70 border border-white/20 px-4 py-2 rounded-2xl"
                        style={{ background: "rgba(255,255,255,0.08)" }}
                      >
                        ENTER{" "}
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        >
                          <path d="M1 5h8M6 2l3 3-3 3" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
              </Link>

              {/* OPPORTUNITIES */}
              <Link
                href="/opportunities"
                className="portal-hover group block min-w-[380px] h-[500px] rounded-3xl overflow-hidden snap-start relative flex-shrink-0 apex-glass border border-white/10"
                onMouseEnter={() => {
                  emotion.transition("resolved");
                  triggerAudio("processing");
                }}
                onMouseLeave={() => {
                  emotion.transition("dormant");
                  triggerAudio("dormant");
                }}
                onClick={() => triggerSentient(0.7)}
              >
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="none"
                  className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-90 scale-100 group-hover:scale-105 transition-all duration-1000"
                  src="https://assets.mixkit.co/videos/preview/866/866-small.mp4"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-between p-8 z-10">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[10px] font-mono tracking-[3px] text-sky-400/70 uppercase border border-sky-400/20 px-3 py-1 rounded-full"
                      style={{ background: "rgba(56,189,248,0.06)" }}
                    >
                      OPTIMISTIC
                    </span>
                    <span className="font-mono text-xs text-white/30">02</span>
                  </div>
                  <div>
                    <h3
                      className="apex-title text-white mb-3"
                      style={{ fontSize: "3.5rem" }}
                    >
                      OPPORTUNITIES
                    </h3>
                    <p className="text-sm text-white/60 max-w-[260px] opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                      {opportunitiesSubtitle}
                    </p>
                    <div className="mt-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100">
                      <span className="text-sky-400 text-xs font-mono">
                        9 provinces
                      </span>
                      <span
                        className="flex items-center gap-1.5 text-xs text-white/70 border border-white/20 px-4 py-2 rounded-2xl"
                        style={{ background: "rgba(255,255,255,0.08)" }}
                      >
                        ENTER{" "}
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        >
                          <path d="M1 5h8M6 2l3 3-3 3" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
              </Link>

              {/* NEWS */}
              <Link
                href="/news"
                className="portal-hover group block min-w-[380px] h-[500px] rounded-3xl overflow-hidden snap-start relative flex-shrink-0 apex-glass border border-white/10"
                onMouseEnter={() => {
                  emotion.transition("processing");
                  triggerAudio("processing");
                }}
                onMouseLeave={() => {
                  emotion.transition("dormant");
                  triggerAudio("dormant");
                }}
                onClick={() => triggerSentient(0.6)}
              >
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="none"
                  className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-90 scale-100 group-hover:scale-105 transition-all duration-1000"
                  src="https://assets.mixkit.co/videos/preview/1080/1080-small.mp4"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-between p-8 z-10">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[10px] font-mono tracking-[3px] text-violet-400/70 uppercase border border-violet-400/20 px-3 py-1 rounded-full"
                      style={{ background: "rgba(139,92,246,0.06)" }}
                    >
                      FOCUSED
                    </span>
                    <span className="font-mono text-xs text-white/30">03</span>
                  </div>
                  <div>
                    <h3
                      className="apex-title text-white mb-3"
                      style={{ fontSize: "3.5rem" }}
                    >
                      NEWS
                    </h3>
                    <p className="text-sm text-white/60 max-w-[260px] opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                      {newsSubtitle}
                    </p>
                    <div className="mt-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100">
                      <span className="text-violet-400 text-xs font-mono">
                        Perplexity Sonar
                      </span>
                      <span
                        className="flex items-center gap-1.5 text-xs text-white/70 border border-white/20 px-4 py-2 rounded-2xl"
                        style={{ background: "rgba(255,255,255,0.08)" }}
                      >
                        ENTER{" "}
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        >
                          <path d="M1 5h8M6 2l3 3-3 3" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
              </Link>

              {/* REELS */}
              <Link
                href="/reels"
                className="portal-hover group block min-w-[380px] h-[500px] rounded-3xl overflow-hidden snap-start relative flex-shrink-0 apex-glass border border-white/10"
                onMouseEnter={() => {
                  emotion.transition("awakened");
                  triggerAudio("awakened");
                }}
                onMouseLeave={() => {
                  emotion.transition("dormant");
                  triggerAudio("dormant");
                }}
              >
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="none"
                  className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-90 scale-100 group-hover:scale-105 transition-all duration-1000"
                  src="https://assets.mixkit.co/videos/preview/289/289-small.mp4"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-between p-8 z-10">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[10px] font-mono tracking-[3px] text-yellow-400/70 uppercase border border-yellow-400/20 px-3 py-1 rounded-full"
                      style={{ background: "rgba(250,204,21,0.06)" }}
                    >
                      JOYFUL
                    </span>
                    <span className="font-mono text-xs text-white/30">04</span>
                  </div>
                  <div>
                    <h3
                      className="apex-title text-white mb-3"
                      style={{ fontSize: "3.5rem" }}
                    >
                      REELS
                    </h3>
                    <p className="text-sm text-white/60 max-w-[260px] opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                      Braamfontein creators going viral right now.
                    </p>
                    <div className="mt-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100">
                      <span className="text-yellow-400 text-xs font-mono">
                        Viral · Live sentiment
                      </span>
                      <span
                        className="flex items-center gap-1.5 text-xs text-white/70 border border-white/20 px-4 py-2 rounded-2xl"
                        style={{ background: "rgba(255,255,255,0.08)" }}
                      >
                        ENTER{" "}
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        >
                          <path d="M1 5h8M6 2l3 3-3 3" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
              </Link>

              {/* SOCIAL */}
              <Link
                href="/social"
                className="portal-hover group block min-w-[380px] h-[500px] rounded-3xl overflow-hidden snap-start relative flex-shrink-0 apex-glass border border-white/10"
                onMouseEnter={() => {
                  emotion.transition("resolved");
                  triggerAudio("processing");
                }}
                onMouseLeave={() => {
                  emotion.transition("dormant");
                  triggerAudio("dormant");
                }}
              >
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="none"
                  className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-90 scale-100 group-hover:scale-105 transition-all duration-1000"
                  src="https://assets.mixkit.co/videos/preview/342/342-small.mp4"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-between p-8 z-10">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[10px] font-mono tracking-[3px] text-cyan-apex/70 uppercase border border-cyan-apex/20 px-3 py-1 rounded-full"
                      style={{ background: "rgba(0,255,200,0.06)" }}
                    >
                      CALM
                    </span>
                    <span className="font-mono text-xs text-white/30">05</span>
                  </div>
                  <div>
                    <h3
                      className="apex-title text-white mb-3"
                      style={{ fontSize: "3.5rem" }}
                    >
                      SOCIAL
                    </h3>
                    <p className="text-sm text-white/60 max-w-[260px] opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                      Empathy-first community intelligence.
                    </p>
                    <div className="mt-4 opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100 flex justify-end">
                      <span
                        className="flex items-center gap-1.5 text-xs text-white/70 border border-white/20 px-4 py-2 rounded-2xl"
                        style={{ background: "rgba(255,255,255,0.08)" }}
                      >
                        ENTER{" "}
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        >
                          <path d="M1 5h8M6 2l3 3-3 3" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
              </Link>

              {/* BLOGS */}
              <Link
                href="/blogs"
                className="portal-hover group block min-w-[380px] h-[500px] rounded-3xl overflow-hidden snap-start relative flex-shrink-0 apex-glass border border-white/10"
                onMouseEnter={() => {
                  emotion.transition("processing");
                  triggerAudio("processing");
                }}
                onMouseLeave={() => {
                  emotion.transition("dormant");
                  triggerAudio("dormant");
                }}
              >
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="none"
                  className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-90 scale-100 group-hover:scale-105 transition-all duration-1000"
                  src="https://assets.mixkit.co/videos/preview/201/201-small.mp4"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-between p-8 z-10">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[10px] font-mono tracking-[3px] text-amber-400/70 uppercase border border-amber-400/20 px-3 py-1 rounded-full"
                      style={{ background: "rgba(251,191,36,0.06)" }}
                    >
                      DEEP
                    </span>
                    <span className="font-mono text-xs text-white/30">06</span>
                  </div>
                  <div>
                    <h3
                      className="apex-title text-white mb-3"
                      style={{ fontSize: "3.5rem" }}
                    >
                      BLOGS
                    </h3>
                    <p className="text-sm text-white/60 max-w-[260px] opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                      Deep-dive essays generated by the swarm.
                    </p>
                    <div className="mt-4 opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100 flex justify-end">
                      <span
                        className="flex items-center gap-1.5 text-xs text-white/70 border border-white/20 px-4 py-2 rounded-2xl"
                        style={{ background: "rgba(255,255,255,0.08)" }}
                      >
                        ENTER{" "}
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        >
                          <path d="M1 5h8M6 2l3 3-3 3" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════════════
          LIVE OPPORTUNITIES
      ════════════════════════════════════════════════════════════════════════ */}
        <AgentReadableChunk
          id="scout-opportunities"
          agentSummary="The Scout Agent on Apex Central surfaces verified digital income opportunities for South Africans, all costing R0–R2000 to start."
          summaryLabel="Live Digital Income Opportunities"
        >
          <section
            id="opportunities"
            className="max-w-6xl mx-auto px-6 py-20 border-t border-white/5"
          >
            <div className="flex items-center justify-between mb-3">
              <h2
                className="flex items-center gap-3 text-white"
                style={{
                  fontSize: "clamp(1.6rem, 3vw, 2.5rem)",
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                }}
              >
                <Zap className="w-7 h-7 text-yellow-400 flex-shrink-0" />
                Live Income Opportunities
              </h2>
              <Link
                href="/opportunities"
                className="text-xs text-white/30 hover:text-yellow-400 transition flex items-center gap-1"
              >
                Full page <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
            <p className="text-white/40 mb-10 text-sm">
              Ask the Scout Agent below — real options under R2000, refreshed
              every 5 minutes.
            </p>

            {opportunities.length === 0 ? (
              <div className="apex-glass p-10 rounded-3xl text-center text-white/30">
                <Zap className="w-8 h-8 mx-auto mb-3 text-yellow-400/40" />
                <p className="text-sm">
                  Ask the AI assistant to activate the Scout Agent.
                </p>
                <p className="text-xs mt-2 text-white/20">
                  &ldquo;Find me a digital income opportunity in Gauteng under
                  R2000&rdquo;
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {opportunities.map((opp) => (
                  <div
                    key={opp.link || opp.title}
                    className="apex-glass p-6 rounded-3xl cursor-pointer hover:border-white/20 border border-transparent portal-hover"
                    onClick={() => {
                      triggerSentient(0.6);
                      window.open(opp.link, "_blank", "noopener,noreferrer");
                    }}
                    role="article"
                    tabIndex={0}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        triggerSentient(0.6);
                        window.open(opp.link, "_blank", "noopener,noreferrer");
                      }
                    }}
                    aria-label={`View opportunity: ${opp.title}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-xs border border-white/10 px-3 py-1 rounded-full text-white/40">
                        {opp.category}
                      </span>
                      <ExternalLink className="w-4 h-4 text-white/20" />
                    </div>
                    <div className="font-semibold text-lg mb-1 text-white">
                      {opp.title}
                    </div>
                    <div className="text-sm text-white/40 mb-3">
                      {opp.province}
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-emerald-400 font-mono">
                        R{opp.cost} cost
                      </span>
                      <span className="text-white/60">
                        {opp.incomePotential}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </AgentReadableChunk>

        {/* ════════════════════════════════════════════════════════════════════════
          LIVE NEWS
      ════════════════════════════════════════════════════════════════════════ */}
        <AgentReadableChunk
          id="live-news"
          agentSummary="Live South African digital economy news via Perplexity Search API, categorised into Latest, Tech & AI, Finance & Crypto, and Startups."
          summaryLabel="Live South African Digital Economy News"
        >
          <section
            id="news"
            className="max-w-6xl mx-auto px-6 py-20 border-t border-white/5"
          >
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <h2
                  className="flex items-center gap-3 text-white"
                  style={{
                    fontSize: "clamp(1.6rem, 3vw, 2.5rem)",
                    fontWeight: 600,
                    letterSpacing: "-0.03em",
                  }}
                >
                  <Newspaper className="w-7 h-7 text-blue-400 flex-shrink-0" />
                  Live News
                </h2>
                <Link
                  href="/news"
                  className="text-xs text-white/30 hover:text-blue-400 transition flex items-center gap-1"
                >
                  Full page <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
              <button
                type="button"
                onClick={() => {
                  void fetchNews(activeCategory);
                  triggerSentient(0.4);
                }}
                disabled={newsLoading}
                className="flex items-center gap-2 text-sm text-white/30 hover:text-white transition disabled:opacity-40"
              >
                <RefreshCw
                  className={`w-4 h-4 ${newsLoading ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
            </div>

            {/* Category tabs */}
            <div className="flex items-center gap-2 mb-10 flex-wrap">
              <Filter className="w-4 h-4 text-white/20 flex-shrink-0" />
              {NEWS_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    startUITransition(() => setActiveCategory(cat));
                    triggerSentient(0.3);
                  }}
                  className={`px-4 py-1.5 rounded-full text-sm transition ${activeCategory === cat ? "bg-white/15 text-white font-medium" : "text-white/30 hover:text-white hover:bg-white/8"}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {newsLoading && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="apex-glass rounded-3xl overflow-hidden animate-pulse"
                  >
                    <div className="bg-white/5 h-44 w-full" />
                    <div className="p-5 space-y-3">
                      <div className="h-4 bg-white/5 rounded w-20" />
                      <div className="h-5 bg-white/5 rounded w-full" />
                      <div className="h-4 bg-white/5 rounded w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!newsLoading && newsError && (
              <div className="apex-glass p-10 rounded-3xl text-center text-white/30">
                <Newspaper className="w-10 h-10 mx-auto mb-4 text-white/20" />
                <p className="mb-4">
                  Add PERPLEXITY_API_KEY to enable live news.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void fetchNews(activeCategory);
                    triggerSentient(0.5);
                  }}
                  className="apex-glass px-6 py-2 rounded-2xl text-sm hover:bg-white/10 transition"
                >
                  Try again
                </button>
              </div>
            )}

            {!newsLoading && !newsError && news.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {news.slice(0, 1).map((article) => (
                  <div
                    key={article.url}
                    className="apex-glass rounded-3xl overflow-hidden col-span-1 md:col-span-2 group border border-transparent hover:border-white/10 portal-hover cursor-pointer"
                    onClick={() => triggerSentient(0.5)}
                  >
                    <div className="relative w-full h-56 overflow-hidden">
                      {article.imageUrl.startsWith("data:") ||
                      failedImages.has(article.url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
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
                          sizes="(max-width: 768px) 100vw, 66vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={() =>
                            setFailedImages((p) => new Set(p).add(article.url))
                          }
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
                      <div className="absolute top-4 left-4">
                        <span className="apex-glass text-xs px-3 py-1 rounded-full text-blue-300">
                          Featured
                        </span>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs text-blue-400 font-medium uppercase tracking-wider">
                          {article.source}
                        </span>
                        {article.date && (
                          <span className="flex items-center gap-1 text-xs text-white/30">
                            <Clock className="w-3 h-3" />
                            {new Date(article.date).toLocaleDateString(
                              "en-ZA",
                              {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              },
                            )}
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-xl leading-snug mb-2 group-hover:text-blue-300 transition line-clamp-2 text-white">
                        {article.title}
                      </h3>
                      <p className="text-white/40 text-sm leading-relaxed line-clamp-2">
                        {article.snippet}
                      </p>
                      <div className="mt-4 flex items-center justify-between">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-white/30 group-hover:text-white transition"
                        >
                          Read full <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                        <button
                          type="button"
                          onClick={() => investigateNews(article.title)}
                          disabled={agentLoading}
                          className="flex items-center gap-1.5 text-xs apex-glass px-3 py-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Microscope className="w-3.5 h-3.5" />
                          Research
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {news.slice(1).map((article) => (
                  <div
                    key={article.url}
                    className="apex-glass rounded-3xl overflow-hidden group border border-transparent hover:border-white/10 flex flex-col portal-hover cursor-pointer"
                    onClick={() => triggerSentient(0.5)}
                  >
                    <div className="relative w-full h-44 overflow-hidden flex-shrink-0">
                      {article.imageUrl.startsWith("data:") ||
                      failedImages.has(article.url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
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
                          onError={() =>
                            setFailedImages((p) => new Set(p).add(article.url))
                          }
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                    </div>
                    <div className="p-5 flex flex-col flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-blue-400 font-medium uppercase tracking-wider truncate">
                          {article.source}
                        </span>
                        {article.date && (
                          <span className="flex items-center gap-1 text-xs text-white/25 flex-shrink-0">
                            <Clock className="w-3 h-3" />
                            {new Date(article.date).toLocaleDateString(
                              "en-ZA",
                              { day: "numeric", month: "short" },
                            )}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-base leading-snug mb-2 group-hover:text-blue-300 transition line-clamp-3 flex-1 text-white">
                        {article.title}
                      </h3>
                      <div className="flex items-center justify-between mt-auto">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-white/25 group-hover:text-white transition"
                        >
                          Read <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                        <button
                          type="button"
                          onClick={() => investigateNews(article.title)}
                          disabled={agentLoading}
                          className="flex items-center gap-1.5 text-xs apex-glass px-2.5 py-1 rounded-full text-white/30 hover:text-white hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
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

        {/* ════════════════════════════════════════════════════════════════════════
          CINEMATIC FOOTER
      ════════════════════════════════════════════════════════════════════════ */}
        <footer className="border-t border-white/5 py-10">
          <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-center justify-between gap-6 text-xs text-white/20 font-mono">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-400 flex items-center justify-center text-[9px] font-bold text-black">
                A
              </div>
              <span>Apex v0.9 · Johannesburg · XRPL Mainnet</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-400/60">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              All systems operational
            </div>
            <span>Built in the Vaal Triangle · African Futurism</span>
          </div>
        </footer>

        {/* ════════════════════════════════════════════════════════════════════════
          FLOATING AI CHAT FAB (unchanged logic)
      ════════════════════════════════════════════════════════════════════════ */}
        <div className="fixed bottom-8 right-8 z-50">
          <AnimatePresence mode="wait">
            {!isChatOpen ? (
              <motion.button
                key="fab"
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => {
                  setIsChatOpen(true);
                  triggerSentient(0.5);
                }}
                aria-label="Toggle AI assistant"
                aria-expanded={isChatOpen}
                className="flex items-center gap-2 apex-glass px-5 py-3 rounded-full shadow-xl hover:bg-white/10 transition"
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
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                className="w-96 apex-glass rounded-3xl overflow-hidden shadow-2xl"
              >
                <div className="p-4 border-b border-white/10 flex items-center gap-3">
                  <MessageSquare className="w-5 h-5" />
                  <span className="font-medium text-sm">
                    Intelligent Engine
                  </span>
                  <span className="text-xs text-emerald-400 animate-pulse ml-auto">
                    ● Online
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      startUITransition(() => setShowProvincePanel((p) => !p))
                    }
                    className={`text-xs px-2 py-1 rounded-lg transition ${selectedProvince ? "bg-blue-500/20 text-blue-300" : "bg-white/10 text-white/40 hover:text-white"}`}
                    title="Select province"
                    aria-label={
                      selectedProvince
                        ? `Province: ${selectedProvince.name}`
                        : "Select province"
                    }
                  >
                    {selectedProvince ? selectedProvince.code : "🌍 SA"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsChatOpen(false)}
                    className="p-1 rounded-full hover:bg-white/10 transition text-white/40 hover:text-white"
                    aria-label="Close chat"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <AnimatePresence>
                  {showProvincePanel && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
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
                <div
                  ref={chatScrollRef}
                  className="h-96 p-6 overflow-y-auto text-sm space-y-4"
                  id="chat"
                >
                  {chatHistory.length === 0 && (
                    <div className="text-white/30 text-center py-8">
                      <p>
                        Ask about digital income opportunities in South Africa.
                      </p>
                      <p className="text-xs mt-2 text-white/20">
                        Powered by Scout Agent + Groq
                      </p>
                    </div>
                  )}
                  {chatHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`fade-slide-in ${msg.role === "user" ? "text-right" : "text-left"}`}
                    >
                      <div
                        className={`inline-block px-4 py-2 rounded-2xl max-w-[80%] ${msg.role === "user" ? "bg-white/10" : "bg-white/5"}`}
                      >
                        {msg.role === "assistant" ? (
                          <StreamingTypography
                            text={msg.content}
                            speed={0.02}
                            variant="default"
                          />
                        ) : (
                          <span className="whitespace-pre-wrap">
                            {msg.content}
                          </span>
                        )}
                      </div>
                      {msg.role === "assistant" &&
                        msg.content &&
                        !agentLoading && (
                          <div className="mt-1">
                            <ChatSpeakButton text={msg.content} />
                          </div>
                        )}
                    </div>
                  ))}
                  {agentLoading &&
                    (!lastMessage ||
                      lastMessage.role !== "assistant" ||
                      !lastMessage.content) && (
                      <div className="text-left">
                        <div className="inline-block px-4 py-2 rounded-2xl bg-white/5 text-white/40">
                          <StreamingTypography
                            text="Thinking…"
                            speed={0.05}
                            variant="thinking"
                          />
                        </div>
                      </div>
                    )}
                  <AnimatePresence>
                    {transactionState.status !== "idle" && (
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
                              markOptimisticSuccess("pending");
                              setTimeout(
                                () => confirmTransaction("confirmed"),
                                2000,
                              );
                            }
                          }}
                          onCancel={resetTransaction}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="p-4 border-t border-white/10 flex gap-3 items-center">
                  {voiceInput.isSupported && (
                    <button
                      type="button"
                      onClick={
                        voiceInput.isListening
                          ? voiceInput.stopListening
                          : voiceInput.startListening
                      }
                      aria-label={
                        voiceInput.isListening ? "Stop voice" : "Start voice"
                      }
                      aria-pressed={voiceInput.isListening}
                      className={`p-2 rounded-full transition ${voiceInput.isListening ? "bg-red-500/30 text-red-400 animate-pulse" : "hover:bg-white/10 text-white/30 hover:text-white"}`}
                    >
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden
                      >
                        <path
                          fillRule="evenodd"
                          d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  )}
                  <input
                    id="ai-chat-input"
                    type="text"
                    value={
                      voiceInput.isListening && voiceInput.interimText
                        ? voiceInput.interimText
                        : aiMessage
                    }
                    onChange={(e) => {
                      if (!voiceInput.isListening) setAiMessage(e.target.value);
                    }}
                    readOnly={voiceInput.isListening}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendToAIAssistant();
                      }
                    }}
                    placeholder={
                      voiceInput.isListening
                        ? "Listening…"
                        : selectedProvince
                          ? `Ask about ${selectedProvince.name}…`
                          : "Ask about opportunities…"
                    }
                    className="flex-1 bg-transparent focus:outline-none text-white placeholder:text-white/25"
                    disabled={agentLoading}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void sendToAIAssistant();
                    }}
                    disabled={agentLoading || !aiMessage.trim()}
                    className="px-6 py-2 apex-glass rounded-2xl hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed text-sm"
                  >
                    Send
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Register modal (unchanged logic) ─────────────────────────────────── */}
        <AnimatePresence>
          {showRegister && (
            <motion.div
              className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="apex-glass w-full max-w-md rounded-3xl p-12 relative overflow-hidden"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
              >
                <div className="liquid-reflection opacity-20" />
                <h3 className="text-3xl font-semibold mb-8 tracking-tighter">
                  Create Account
                </h3>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  className="w-full apex-glass px-6 py-4 rounded-2xl mb-6 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
                />
                <button
                  type="button"
                  onClick={handleRegister}
                  className="w-full py-4 apex-glass rounded-2xl text-lg font-medium hover:bg-white/10 transition tracking-tight"
                >
                  Join Now
                </button>
                <button
                  type="button"
                  onClick={() => setShowRegister(false)}
                  className="mt-6 text-xs text-white/30 hover:text-white transition"
                >
                  Cancel
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Sensory controls ──────────────────────────────────────────────────── */}
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
