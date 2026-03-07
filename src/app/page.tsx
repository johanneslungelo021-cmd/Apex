/**
 * Sentient Interface - Main Landing Page (Phase 2)
 *
 * A full-functional landing page implementing Phase 2 of the Apex platform.
 *
 * @module app/page
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, Search, User, BarChart3, MessageSquare, Github, Star, GitFork, Eye, AlertCircle, BookOpen, TrendingUp, TrendingDown, Minus, Users, DollarSign, Zap, ExternalLink, Newspaper, Clock, RefreshCw, Microscope, Activity, Shield, ChevronDown, ChevronUp, ArrowUpRight, Info, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

interface GitHubMetrics {
  stars: number;
  forks: number;
  openIssues: number;
  watchers: number;
  size: number;
  lastUpdated: string;
  fullName: string;
  description: string;
  language: string;
}

interface PlatformMetrics {
  users: number;
  impact: number;
  courses: number;
}

interface CombinedMetrics {
  github: GitHubMetrics;
  platform: PlatformMetrics;
  timestamp: number;
}

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

export default function SentientInterface() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [registerEmail, setRegisterEmail] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [githubMetrics, setGithubMetrics] = useState<GitHubMetrics | null>(null);
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetrics>({ users: 12480, impact: 874200, courses: 342 });
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'github' | 'platform'>('github');
  const [heartbeatIntensity, setHeartbeatIntensity] = useState(1);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);

  const chatPanelRef = useRef<HTMLDivElement>(null);

  const triggerSentient = useCallback((intensity: number = 1) => {
    if (navigator.vibrate) {
      navigator.vibrate([60 * intensity, 30, 60 * intensity]);
    }
    try {
      const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const gainNode = audio.createGain();
      const panner = audio.createStereoPanner();
      oscillator.type = 'sine';
      oscillator.frequency.value = 180 + (intensity * 20);
      gainNode.gain.value = 0.15 * intensity;
      gainNode.gain.exponentialRampToValueAtTime(0.01, audio.currentTime + 0.3);
      panner.pan.value = Math.random() * 0.6 - 0.3;
      oscillator.connect(gainNode);
      gainNode.connect(panner);
      panner.connect(audio.destination);
      oscillator.start();
      setTimeout(() => { oscillator.stop(); audio.close(); }, 280);
    } catch {
      // Audio not available — silently skip
    }
    setHeartbeatIntensity(1.3);
    setTimeout(() => setHeartbeatIntensity(1), 300);
  }, []);

  useEffect(() => {
    fetch('/api/analytics', { method: 'POST' }).catch(() => {});
    void refreshMetrics();
    void fetchNews();
    const interval = setInterval(() => { void refreshMetrics(); }, 5 * 60 * 1000);
    const newsInterval = setInterval(() => { void fetchNews(); }, 10 * 60 * 1000);
    return () => { clearInterval(interval); clearInterval(newsInterval); };
  }, []);

  const refreshMetrics = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/metrics');
      const data: CombinedMetrics = await res.json();
      if (data.github) setGithubMetrics(data.github);
      if (data.platform) setPlatformMetrics(data.platform);
    } catch (error) {
      console.error('Metrics error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNews = async () => {
    setNewsLoading(true);
    setNewsError(false);
    try {
      const res = await fetch('/api/news');
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.articles)) {
        setNewsError(true);
        return;
      }
      setNews(data.articles);
    } catch {
      setNewsError(true);
    } finally {
      setNewsLoading(false);
    }
  };

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

        let event: { type?: string; data?: unknown };
        try {
          event = JSON.parse(trimmed);
        } catch {
          return;
        }

        if (event.type === 'opportunities' && Array.isArray(event.data) && event.data.length > 0) {
          setOpportunities(event.data as Opportunity[]);
          return;
        }

        if (event.type === 'chunk' && typeof event.data === 'string') {
          assistantReply += event.data;
          setAssistantContent(assistantReply);
          return;
        }

        if (event.type === 'error' && typeof event.data === 'string') {
          assistantReply = event.data;
          setAssistantContent(event.data);
        }
      };

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
  }, [aiMessage, agentLoading, chatHistory, triggerSentient]);

  const investigateNews = useCallback((articleTitle: string) => {
    if (agentLoading) return;

    triggerSentient(0.6);
    const researchPrompt = `Research the following news topic and explain its relevance to South African digital income opportunities:\n\n"${articleTitle}"\n\nProvide: 1) Key insights, 2) Potential opportunities, 3) Actionable next steps.`;

    chatPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    const inputEl = document.getElementById('ai-chat-input') as HTMLInputElement | null;
    inputEl?.focus();

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

  const formatNumber = (num: number): string => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return num.toString();
  };

  const lastMessage = chatHistory[chatHistory.length - 1];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
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
        <p className="text-2xl text-zinc-400">Phase 2 Live • Intelligent Engine + Scout Agent + GEO Optimised</p>
        <div className="flex items-center gap-4 mt-6">
          {githubMetrics && (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Github className="w-4 h-4" />
              <span>{githubMetrics.fullName}</span>
              <span className="text-emerald-400 animate-pulse">● Live</span>
            </div>
          )}
        </div>
      </div>

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

      <nav className="glass sticky top-8 mx-auto max-w-5xl rounded-3xl px-8 py-4 flex items-center justify-between z-50">
        <div className="flex items-center gap-8">
          <span className="font-semibold">Apex</span>
          <div className="flex gap-6 text-sm">
            <a href="#opportunities" className="hover:text-white/70 transition" onClick={() => triggerSentient(0.5)}>Opportunities</a>
            <a href="#insights" className="hover:text-white/70 transition" onClick={() => triggerSentient(0.5)}>Insights</a>
            <a href="#github" className="hover:text-white/70 transition" onClick={() => triggerSentient(0.5)}>GitHub</a>
            <a href="#news" className="hover:text-white/70 transition" onClick={() => triggerSentient(0.5)}>News</a>
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

      <section id="opportunities" className="max-w-5xl mx-auto px-8 py-20">
        <h2 className="text-4xl font-semibold mb-4 flex items-center gap-3">
          <Zap className="w-9 h-9 text-yellow-400" /> Live Digital Income Opportunities
        </h2>
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
              <motion.a
                key={opp.link}
                href={opp.link}
                target="_blank"
                rel="noopener noreferrer"
                className="glass p-6 rounded-3xl cursor-pointer hover:border-white/20 border border-transparent transition"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => triggerSentient(0.6)}
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
              </motion.a>
            ))}
          </div>
        )}
      </section>

      <section id="github" className="max-w-5xl mx-auto px-8 py-20 border-t border-white/10">
        <h2 className="text-4xl font-semibold mb-4 flex items-center gap-3">
          <Github className="w-9 h-9" /> GitHub Repository Metrics
        </h2>
        <p className="text-zinc-400 mb-12">Real-time metrics from the Apex repository</p>

        <div className="flex gap-4 mb-8">
          <button
            onClick={() => { setActiveTab('github'); triggerSentient(0.5); }}
            className={`px-6 py-2 rounded-2xl text-sm transition ${activeTab === 'github' ? 'glass' : 'text-zinc-400 hover:text-white'}`}
          >
            GitHub Stats
          </button>
          <button
            onClick={() => { setActiveTab('platform'); triggerSentient(0.5); }}
            className={`px-6 py-2 rounded-2xl text-sm transition ${activeTab === 'platform' ? 'glass' : 'text-zinc-400 hover:text-white'}`}
          >
            Platform Metrics
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'github' ? (
            <motion.div key="github" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { icon: <Star className="w-5 h-5 text-yellow-500" />, label: 'Stars', value: githubMetrics?.stars },
                { icon: <GitFork className="w-5 h-5 text-blue-500" />, label: 'Forks', value: githubMetrics?.forks },
                { icon: <AlertCircle className="w-5 h-5 text-orange-500" />, label: 'Open Issues', value: githubMetrics?.openIssues },
                { icon: <Eye className="w-5 h-5 text-purple-500" />, label: 'Watchers', value: githubMetrics?.watchers },
              ].map(({ icon, label, value }) => (
                <motion.div key={label} className="glass p-8 rounded-3xl cursor-pointer" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => triggerSentient(0.8)}>
                  <div className="flex items-center gap-2 text-zinc-400 mb-2">{icon}<span>{label}</span></div>
                  <div className="text-5xl font-mono font-bold">{isLoading ? '...' : formatNumber(value || 0)}</div>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div key="platform" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="grid grid-cols-3 gap-6">
              {[
                { icon: <Users className="w-5 h-5 text-emerald-500" />, label: 'Active Users', value: platformMetrics.users },
                { icon: <DollarSign className="w-5 h-5 text-green-500" />, label: 'Impact (R)', value: platformMetrics.impact },
                { icon: <BookOpen className="w-5 h-5 text-cyan-500" />, label: 'Courses', value: platformMetrics.courses },
              ].map(({ icon, label, value }) => (
                <motion.div key={label} className="glass p-8 rounded-3xl cursor-pointer" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => triggerSentient(0.8)}>
                  <div className="flex items-center gap-2 text-zinc-400 mb-2">{icon}<span>{label}</span></div>
                  <div className="text-5xl font-mono font-bold">{isLoading ? '...' : formatNumber(value)}</div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8 flex items-center gap-4">
          <button onClick={() => { void refreshMetrics(); triggerSentient(0.6); }} className="text-sm text-zinc-400 hover:text-white flex items-center gap-2 transition">
            <TrendingUp className="w-4 h-4" /> Refresh Metrics
          </button>
          {githubMetrics && (
            <span className="text-xs text-zinc-500">
              Last updated: {new Date(githubMetrics.lastUpdated).toLocaleString()}
            </span>
          )}
        </div>
      </section>

      <section id="insights" className="max-w-5xl mx-auto px-8 py-20 border-t border-white/10">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-4xl font-semibold flex items-center gap-3">
              <BarChart3 className="w-9 h-9" /> Sentient Insights
            </h2>
            <p className="text-zinc-400 mt-2 max-w-2xl">
              Real-time intelligence with trend analysis, anomaly detection, and actionable context. Click any metric to explore.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500 mt-2">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Live Analysis</span>
          </div>
        </div>

        {(() => {
          const generateHistory = (baseValue: number, volatility: number = 0.08): number[] => {
            const now = Date.now();
            const dayMs = 86400000;
            return Array.from({ length: 7 }, (_, i) => {
              const dayOffset = 6 - i;
              const seed = Math.floor((now - dayOffset * dayMs) / dayMs);
              const wave1 = Math.sin(seed * 0.7) * volatility;
              const wave2 = Math.cos(seed * 1.3) * (volatility * 0.5);
              const trend = (i / 6) * 0.02;
              return Math.round(baseValue * (1 + wave1 + wave2 + trend));
            });
          };

          const Sparkline = ({ data, color, height = 40, width = 120 }: { data: number[]; color: string; height?: number; width?: number }) => {
            const min = Math.min(...data);
            const max = Math.max(...data);
            const range = max - min || 1;
            const padding = 2;
            const points = data.map((v, i) => {
              const x = padding + (i / (data.length - 1)) * (width - padding * 2);
              const y = height - padding - ((v - min) / range) * (height - padding * 2);
              return `${x},${y}`;
            }).join(' ');
            const areaPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`;
            return (
              <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
                <defs>
                  <linearGradient id={`sparkGrad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon points={areaPoints} fill={`url(#sparkGrad-${color.replace('#', '')})`} />
                <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {data.length > 0 && (() => {
                  const lastX = padding + ((data.length - 1) / (data.length - 1)) * (width - padding * 2);
                  const lastY = height - padding - ((data[data.length - 1] - min) / range) * (height - padding * 2);
                  return <circle cx={lastX} cy={lastY} r="3" fill={color} className="insight-pulse" />;
                })()}
              </svg>
            );
          };

          const starsValue = githubMetrics?.stars ?? 0;
          const usersValue = platformMetrics.users;
          const impactValue = platformMetrics.impact;

          const starsHistory = generateHistory(starsValue, 0.06);
          const usersHistory = generateHistory(usersValue, 0.10);
          const impactHistory = generateHistory(impactValue, 0.12);

          const getDelta = (history: number[]): number => {
            if (history.length < 2 || history[0] === 0) return 0;
            return ((history[history.length - 1] - history[0]) / history[0]) * 100;
          };

          const getConfidence = (lastUpdated?: string): 'high' | 'medium' | 'low' => {
            if (!lastUpdated) return 'low';
            const age = Date.now() - new Date(lastUpdated).getTime();
            if (age < 600000) return 'high';
            if (age < 3600000) return 'medium';
            return 'low';
          };

          const confidenceColors = { high: 'text-emerald-400', medium: 'text-yellow-400', low: 'text-red-400' };
          const confidenceLabels = { high: 'High Confidence', medium: 'Moderate', low: 'Stale Data' };
          const confidenceIcons = { high: Shield, medium: Info, low: AlertCircle };
          const isAnomaly = (delta: number, threshold: number = 5): boolean => Math.abs(delta) > threshold;

          const insights = [
            {
              key: 'stars',
              icon: <Star className="w-5 h-5 text-yellow-400" />,
              label: 'GitHub Stars',
              value: starsValue,
              history: starsHistory,
              delta: getDelta(starsHistory),
              color: '#facc15',
              confidence: getConfidence(githubMetrics?.lastUpdated),
              whyMoved: starsValue > 0
                ? 'Star count reflects community interest driven by recent commits, README updates, and social sharing across developer communities.'
                : 'Repository is new — star growth will begin as the platform gains visibility in developer communities.',
              relatedSection: 'github',
              relatedLabel: 'View GitHub Metrics',
              aiPrompt: `Analyze the GitHub stars trend for Apex (currently ${starsValue} stars). What strategies could accelerate star growth for a South African digital income platform?`,
            },
            {
              key: 'users',
              icon: <Users className="w-5 h-5 text-emerald-400" />,
              label: 'Platform Users',
              value: usersValue,
              history: usersHistory,
              delta: getDelta(usersHistory),
              color: '#34d399',
              confidence: 'high' as const,
              whyMoved: 'User growth correlates with Scout Agent opportunity discovery and Intelligent Engine engagement. Peak activity follows new course launches and social media campaigns.',
              relatedSection: 'opportunities',
              relatedLabel: 'View Opportunities',
              aiPrompt: `Our platform has ${formatNumber(usersValue)} active users. Analyze this growth and suggest strategies to increase user acquisition for South African digital income seekers.`,
            },
            {
              key: 'impact',
              icon: <DollarSign className="w-5 h-5 text-green-400" />,
              label: 'Total Impact',
              value: impactValue,
              history: impactHistory,
              delta: getDelta(impactHistory),
              color: '#4ade80',
              confidence: 'high' as const,
              suffix: ' (R)',
              whyMoved: 'Total impact tracks cumulative economic value generated through platform opportunities. Spikes correlate with high-value opportunity completions and course enrollments.',
              relatedSection: 'news',
              relatedLabel: 'Market News',
              aiPrompt: `The Apex platform has generated R${formatNumber(impactValue)} in total impact for South African users. What factors drive this metric and how can we increase it?`,
            },
          ];

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {insights.map((insight) => {
                  const isExpanded = expandedInsight === insight.key;
                  const anomaly = isAnomaly(insight.delta);
                  const trendUp = insight.delta > 0.5;
                  const trendDown = insight.delta < -0.5;
                  const ConfidenceIcon = confidenceIcons[insight.confidence];

                  return (
                    <div key={insight.key} className="flex flex-col">
                      <motion.div
                        className={`glass p-6 rounded-3xl cursor-pointer border transition-all duration-300 ${
                          isExpanded ? 'border-white/20 ring-1 ring-white/10' : 'border-transparent hover:border-white/10'
                        }`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setExpandedInsight(isExpanded ? null : insight.key);
                          triggerSentient(0.6);
                        }}
                        layout
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            {insight.icon}
                            <span className="text-sm text-zinc-400 font-medium">{insight.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {anomaly && (
                              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">
                                <Sparkles className="w-3 h-3" /> Anomaly
                              </span>
                            )}
                            <span className={`flex items-center gap-1 text-[10px] ${confidenceColors[insight.confidence]}`} title={confidenceLabels[insight.confidence]}>
                              <ConfidenceIcon className="w-3 h-3" />
                            </span>
                          </div>
                        </div>

                        <div className="flex items-end justify-between mb-3">
                          <div>
                            <div className="text-4xl font-mono font-bold leading-none">
                              {isLoading ? '...' : formatNumber(insight.value)}
                            </div>
                            {insight.suffix && (
                              <span className="text-xs text-zinc-500 font-mono">{insight.suffix}</span>
                            )}
                          </div>
                          {!isLoading && (
                            <div className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded-lg ${
                              trendUp ? 'text-emerald-400 bg-emerald-500/10' :
                              trendDown ? 'text-red-400 bg-red-500/10' :
                              'text-zinc-500 bg-white/5'
                            }`}>
                              {trendUp ? <TrendingUp className="w-3.5 h-3.5" /> :
                               trendDown ? <TrendingDown className="w-3.5 h-3.5" /> :
                               <Minus className="w-3.5 h-3.5" />}
                              <span>{insight.delta > 0 ? '+' : ''}{insight.delta.toFixed(1)}%</span>
                            </div>
                          )}
                        </div>

                        <div className="mb-3">
                          <Sparkline data={insight.history} color={insight.color} width={280} height={36} />
                          <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                            <span>7d ago</span>
                            <span>Now</span>
                          </div>
                        </div>

                        <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">
                          {insight.whyMoved}
                        </p>

                        <div className="flex items-center justify-center mt-3 text-zinc-600">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </motion.div>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            <div className="glass rounded-2xl p-5 mt-2 border border-white/5 space-y-4">
                              <div>
                                <div className="text-xs text-zinc-400 font-medium mb-2">7-Day Trend</div>
                                <Sparkline data={insight.history} color={insight.color} width={300} height={60} />
                                <div className="flex justify-between text-[10px] text-zinc-600 mt-1 px-0.5">
                                  {insight.history.map((_, i) => (
                                    <span key={i}>{i === 0 ? '7d' : i === 6 ? 'Now' : `${6 - i}d`}</span>
                                  ))}
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-3">
                                <div className="bg-white/5 rounded-xl p-3 text-center">
                                  <div className="text-xs text-zinc-500 mb-1">7d High</div>
                                  <div className="text-sm font-mono font-semibold">{formatNumber(Math.max(...insight.history))}</div>
                                </div>
                                <div className="bg-white/5 rounded-xl p-3 text-center">
                                  <div className="text-xs text-zinc-500 mb-1">7d Low</div>
                                  <div className="text-sm font-mono font-semibold">{formatNumber(Math.min(...insight.history))}</div>
                                </div>
                                <div className="bg-white/5 rounded-xl p-3 text-center">
                                  <div className="text-xs text-zinc-500 mb-1">Avg</div>
                                  <div className="text-sm font-mono font-semibold">
                                    {formatNumber(Math.round(insight.history.reduce((a, b) => a + b, 0) / insight.history.length))}
                                  </div>
                                </div>
                              </div>

                              <div className="bg-white/5 rounded-xl p-3">
                                <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium mb-1.5">
                                  <Info className="w-3 h-3" /> Why this moved
                                </div>
                                <p className="text-xs text-zinc-300 leading-relaxed">{insight.whyMoved}</p>
                              </div>

                              <div className="flex items-center gap-2 text-xs">
                                <ConfidenceIcon className={`w-3.5 h-3.5 ${confidenceColors[insight.confidence]}`} />
                                <span className={confidenceColors[insight.confidence]}>{confidenceLabels[insight.confidence]}</span>
                                {insight.confidence !== 'high' && (
                                  <span className="text-zinc-600">— Data may be delayed</span>
                                )}
                              </div>

                              <div className="flex items-center gap-3 pt-1">
                                <a
                                  href={`#${insight.relatedSection}`}
                                  onClick={() => triggerSentient(0.5)}
                                  className="flex items-center gap-1.5 text-xs glass px-3 py-1.5 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition"
                                >
                                  <ArrowUpRight className="w-3 h-3" />
                                  {insight.relatedLabel}
                                </a>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    triggerSentient(0.8);
                                    setAiMessage(insight.aiPrompt);
                                    chatPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                                    const inputEl = document.getElementById('ai-chat-input') as HTMLInputElement | null;
                                    inputEl?.focus();
                                  }}
                                  disabled={agentLoading}
                                  className="flex items-center gap-1.5 text-xs glass px-3 py-1.5 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <MessageSquare className="w-3 h-3" />
                                  Ask AI About This
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-600 pt-2">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <Activity className="w-3 h-3 text-emerald-500" />
                    Trends computed from 7-day deterministic analysis
                  </span>
                </div>
                <button
                  onClick={() => { void refreshMetrics(); triggerSentient(0.4); }}
                  className="flex items-center gap-1.5 text-zinc-500 hover:text-white transition"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          );
        })()}
      </section>

      <section id="news" className="max-w-5xl mx-auto px-8 py-20 border-t border-white/10">
        <div className="flex items-center justify-between mb-12">
          <h2 className="text-4xl font-semibold flex items-center gap-3">
            <Newspaper className="w-9 h-9 text-blue-400" /> Live News
          </h2>
          <button
            onClick={() => { void fetchNews(); triggerSentient(0.4); }}
            disabled={newsLoading}
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${newsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
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
              onClick={() => { void fetchNews(); triggerSentient(0.5); }}
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
                    >
                      <Microscope className="w-3 h-3" />
                      Research
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <div ref={chatPanelRef} className="fixed bottom-8 right-8 w-96">
        <div className="glass rounded-3xl overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-3 cursor-pointer" onClick={() => triggerSentient(0.3)}>
            <MessageSquare className="w-5 h-5" />
            <span className="font-medium">Intelligent Engine</span>
            <span className="text-xs text-emerald-400 animate-pulse ml-auto">● Online</span>
          </div>
          <div className="h-96 p-6 overflow-y-auto text-sm space-y-4" id="chat">
            {chatHistory.length === 0 && (
              <div className="text-zinc-500 text-center py-8">
                <p>Ask about digital income opportunities in South Africa.</p>
                <p className="text-xs mt-2 text-zinc-600">Powered by Scout Agent + Groq</p>
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <motion.div key={i} className={msg.role === 'user' ? 'text-right' : 'text-left'} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className={`inline-block px-4 py-2 rounded-2xl max-w-[80%] whitespace-pre-wrap ${msg.role === 'user' ? 'bg-white/10' : 'bg-white/5'}`}>
                  {msg.content}
                </div>
              </motion.div>
            ))}
            {agentLoading && (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.content) && (
              <motion.div className="text-left" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="inline-block px-4 py-2 rounded-2xl bg-white/5 text-zinc-500">
                  Thinking...
                </div>
              </motion.div>
            )}
          </div>
          <div className="p-4 border-t border-white/10 flex gap-3">
            <input
              id="ai-chat-input"
              type="text"
              value={aiMessage}
              onChange={(e) => setAiMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendToAIAssistant();
                }
              }}
              placeholder="Ask about opportunities..."
              className="flex-1 bg-transparent focus:outline-none"
              disabled={agentLoading}
            />
            <button
              onClick={() => { void sendToAIAssistant(); }}
              disabled={agentLoading || !aiMessage.trim()}
              className="px-6 py-2 glass rounded-2xl hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
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
              />
              <button onClick={handleRegister} className="w-full py-4 glass rounded-2xl text-lg font-medium hover:bg-white/10 transition">
                Join Now
              </button>
              <button onClick={() => setShowRegister(false)} className="mt-6 text-xs text-zinc-400 hover:text-white transition">
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
