/**
 * Sentient Interface - Main Landing Page
 *
 * Public-facing page for the Apex platform. Shows:
 * - Live digital income opportunities (Scout Agent via /api/ai-agent)
 * - Live categorised news (Perplexity Search via /api/news)
 * - Collapsible AI assistant as a Floating Action Button
 *
 * GitHub metrics and platform analytics live in Grafana / Vercel dashboards
 * and are intentionally NOT shown here — they are internal observability
 * tooling, not public product features.
 *
 * @module app/page
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Heart, Search, User, MessageSquare, ExternalLink,
  Newspaper, Clock, RefreshCw, Microscope, Zap, Filter, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

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

const NEWS_CATEGORIES = ['Latest', 'Tech & AI', 'Finance & Crypto', 'Startups'] as const;
type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export default function SentientInterface() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [registerEmail, setRegisterEmail] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([]);
  const [heartbeatIntensity, setHeartbeatIntensity] = useState(1);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [agentLoading, setAgentLoading] = useState(false);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState<NewsCategory>('Latest');
  const [isChatOpen, setIsChatOpen] = useState(false);
  /** Authenticated user from session cookie — null when not logged in */
  const [sessionUser, setSessionUser] = useState<{ domain: string } | null>(null);

  const chatScrollRef = useRef<HTMLDivElement>(null);

  // ── Sentient feedback ──────────────────────────────────────────────────────

  const triggerSentient = useCallback((intensity: number = 1) => {
    if (navigator.vibrate) navigator.vibrate([60 * intensity, 30, 60 * intensity]);
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner();
      osc.type = 'sine';
      osc.frequency.value = 180 + intensity * 20;
      gain.gain.value = 0.15 * intensity;
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      pan.pan.value = Math.random() * 0.6 - 0.3;
      osc.connect(gain); gain.connect(pan); pan.connect(ctx.destination);
      osc.start(); setTimeout(() => { osc.stop(); ctx.close(); }, 280);
    } catch { /* Audio unavailable */ }
    setHeartbeatIntensity(1.3);
    setTimeout(() => setHeartbeatIntensity(1), 300);
  }, []);

  // ── News ──────────────────────────────────────────────────────────────────

  const fetchNews = useCallback(async (category: NewsCategory) => {
    setNewsLoading(true);
    setNewsError(false);
    setFailedImages(new Set());
    try {
      const res = await fetch(`/api/news?category=${encodeURIComponent(category)}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.articles)) { setNewsError(true); return; }
      setNews(data.articles);
    } catch {
      setNewsError(true);
    } finally {
      setNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/analytics', { method: 'POST' }).catch(() => {});

    // Check for existing session
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((d) => { if (d.user) setSessionUser(d.user); })
      .catch(() => {});

    // PWA shortcut URL params: ?openChat=1, ?category=Tech+%26+AI
    const params = new URLSearchParams(window.location.search);
    if (params.get('openChat') === '1') setIsChatOpen(true);
    const catParam = params.get('category');
    if (catParam && (NEWS_CATEGORIES as readonly string[]).includes(catParam)) {
      setActiveCategory(catParam as NewsCategory);
    }
  }, []);

  useEffect(() => {
    fetchNews(activeCategory);
    const interval = setInterval(() => fetchNews(activeCategory), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchNews, activeCategory]);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (isChatOpen && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, agentLoading, isChatOpen]);

  // ── AI Agent ──────────────────────────────────────────────────────────────

  const sendToAIAssistant = useCallback(async (overrideMessage?: string) => {
    const content = (overrideMessage ?? aiMessage).trim();
    if (!content || agentLoading) return;

    triggerSentient(1.2);
    const userMsg = { role: 'user', content };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    if (!overrideMessage) setAiMessage('');
    setAgentLoading(true);

    const agentMessages = newHistory
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    try {
      const res = await fetch('/api/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: agentMessages }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChatHistory([...newHistory, { role: 'assistant', content: data.message || 'Something went wrong. Please try again.' }]);
      } else {
        setChatHistory([...newHistory, { role: 'assistant', content: data.reply }]);
        if (Array.isArray(data.opportunities) && data.opportunities.length > 0) {
          setOpportunities(data.opportunities);
        }
      }
      triggerSentient(0.8);
    } catch {
      setChatHistory([...newHistory, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    } finally {
      setAgentLoading(false);
    }
  }, [aiMessage, agentLoading, chatHistory, triggerSentient]);

  const investigateNews = useCallback((articleTitle: string) => {
    triggerSentient(0.6);
    setIsChatOpen(true);
    const prompt = `Research this news for South African digital income context:\n\n"${articleTitle}"\n\nProvide: 1) Key insights, 2) Opportunities for SA creators, 3) Actionable next steps under R2000.`;
    sendToAIAssistant(prompt);
  }, [triggerSentient, sendToAIAssistant]);

  // ── Registration ──────────────────────────────────────────────────────────

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
        setShowRegister(false);
        setRegisterEmail('');
        if (data.user?.domain) setSessionUser({ domain: data.user.domain });
        triggerSentient(1);
      } else {
        alert(data.message || 'Registration failed. Please check your email and try again.');
      }
    } catch (err) {
      alert('Registration failed: ' + (err instanceof Error ? err.message : 'Please try again.'));
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setSessionUser(null);
    triggerSentient(0.5);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* Hero */}
      <div className="glass mx-auto max-w-5xl mt-16 rounded-3xl p-16 relative overflow-hidden">
        <div className="liquid-reflection" />
        <div className="flex items-center gap-4 mb-6">
          <motion.div animate={{ scale: heartbeatIntensity }} transition={{ type: 'spring', stiffness: 300 }}>
            <Heart
              className="w-12 h-12 text-red-500 heart-pulse"
              style={{ filter: `drop-shadow(0 0 ${10 * heartbeatIntensity}px rgba(239,68,68,0.6))` }}
            />
          </motion.div>
          <h1 className="text-7xl font-bold tracking-tighter">Sentient Interface</h1>
        </div>
        <p className="text-2xl text-zinc-400">Phase 2 Live • Intelligent Engine + Scout Agent + GEO Optimised</p>
      </div>

      {/* GEO Answer-First Block */}
      <div className="glass mx-auto max-w-5xl mt-8 p-8 rounded-3xl border border-white/10">
        <div className="flex items-center gap-3 mb-4">
          <Zap className="w-6 h-6 text-yellow-400" />
          <h2 className="text-2xl font-bold">What is Apex?</h2>
        </div>
        <p className="text-lg text-zinc-300 leading-relaxed">
          Apex is a living digital platform that helps South African creators build sustainable digital income.
          It combines an AI-powered Scout Agent that finds real opportunities under R2000, a conversational
          Intelligent Engine for personalised guidance, and full observability through Grafana Cloud via OpenTelemetry.
        </p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
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

      {/* Navigation */}
      <nav className="glass sticky top-8 mx-auto max-w-5xl rounded-3xl px-8 py-4 flex items-center justify-between z-50 mt-8">
        <div className="flex items-center gap-8">
          <span className="font-semibold">Apex</span>
          <div className="flex gap-6 text-sm">
            <a href="#opportunities" className="hover:text-white/70 transition" onClick={() => triggerSentient(0.5)}>Opportunities</a>
            <a href="#news" className="hover:text-white/70 transition" onClick={() => triggerSentient(0.5)}>News</a>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-3 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search blogs & insights..."
              className="glass pl-12 pr-6 py-3 w-64 sm:w-80 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-white/20 transition"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); if (e.target.value.length % 3 === 0) triggerSentient(0.3); }}
            />
          </div>
          {sessionUser ? (
            <div className="flex items-center gap-2">
              <span className="glass px-3 py-2 rounded-2xl text-xs text-emerald-400 hidden sm:block">
                ● {sessionUser.domain}
              </span>
              <button
                onClick={handleLogout}
                className="glass px-4 py-3 rounded-2xl flex items-center gap-2 hover:scale-105 transition text-zinc-400 hover:text-white text-sm"
              >
                <User className="w-4 h-4" /> Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setShowRegister(true); triggerSentient(1); }}
              className="glass px-6 py-3 rounded-2xl flex items-center gap-2 hover:scale-105 transition"
            >
              <User className="w-4 h-4" /> Register
            </button>
          )}
        </div>
      </nav>

      {/* Live Opportunities */}
      <section id="opportunities" className="max-w-5xl mx-auto px-8 py-20">
        <h2 className="text-4xl font-semibold mb-4 flex items-center gap-3">
          <Zap className="w-9 h-9 text-yellow-400" /> Live Digital Income Opportunities
        </h2>
        <p className="text-zinc-400 mb-8">
          Ask the AI assistant to discover opportunities — the Scout Agent finds real options under R2000.
        </p>

        {opportunities.length === 0 ? (
          <div className="glass p-8 rounded-3xl text-center text-zinc-500">
            <Zap className="w-8 h-8 mx-auto mb-3 text-yellow-400/50" />
            <p>Open the AI assistant to activate the Scout Agent.</p>
            <p className="text-sm mt-2">Try: &quot;Find me a digital income opportunity in Gauteng under R2000&quot;</p>
            <button
              onClick={() => { setIsChatOpen(true); triggerSentient(0.5); }}
              className="mt-4 glass px-6 py-2 rounded-2xl text-sm hover:bg-white/10 transition text-blue-300"
            >
              Open AI Scout →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {opportunities.map((opp) => (
              <motion.a
                key={opp.link}
                href={opp.link}
                target="_blank"
                rel="noopener noreferrer"
                className="glass p-6 rounded-3xl border border-transparent hover:border-white/20 transition"
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

      {/* Live News */}
      <section id="news" className="max-w-5xl mx-auto px-8 py-20 border-t border-white/10">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <h2 className="text-4xl font-semibold flex items-center gap-3">
            <Newspaper className="w-9 h-9 text-blue-400" /> Live News
          </h2>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Filter className="w-4 h-4 text-zinc-500 flex-shrink-0" />
            {NEWS_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => { if (cat !== activeCategory) { setActiveCategory(cat); triggerSentient(0.3); } }}
                className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-all duration-200 border flex-shrink-0 ${
                  activeCategory === cat
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                    : 'glass border-transparent text-zinc-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
            <button
              onClick={() => { fetchNews(activeCategory); triggerSentient(0.4); }}
              disabled={newsLoading}
              className="ml-1 flex items-center glass px-3 py-1.5 rounded-full text-zinc-400 hover:text-white transition disabled:opacity-40 flex-shrink-0"
              aria-label="Refresh news"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${newsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Loading skeleton */}
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
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!newsLoading && newsError && (
          <div className="glass p-10 rounded-3xl text-center text-zinc-500">
            <Newspaper className="w-10 h-10 mx-auto mb-4 text-zinc-600" />
            <p className="text-lg mb-2">News unavailable</p>
            <p className="text-sm mb-6">Add PERPLEXITY_API_KEY to your environment variables to enable live news.</p>
            <button onClick={() => { fetchNews(activeCategory); triggerSentient(0.5); }} className="glass px-6 py-2 rounded-2xl text-sm hover:bg-white/10 transition">
              Try again
            </button>
          </div>
        )}

        {/* Articles grid */}
        {!newsLoading && !newsError && news.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            {/* Featured — spans 2 columns */}
            {news.slice(0, 1).map((article) => (
              <motion.div
                key={article.url}
                className="glass rounded-3xl overflow-hidden col-span-1 md:col-span-2 group border border-transparent hover:border-white/10 transition"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <div className="relative w-full h-56 overflow-hidden">
                  {article.imageUrl.startsWith('data:') || failedImages.has(article.url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover" />
                  ) : (
                    <Image
                      src={article.imageUrl} alt={article.title} fill
                      sizes="(max-width: 768px) 100vw, 66vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={() => setFailedImages((prev) => new Set(prev).add(article.url))}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute top-4 left-4 z-10">
                    <span className="glass text-xs px-3 py-1 rounded-full text-blue-300 font-medium">{activeCategory}</span>
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
                    <a href={article.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition" onClick={(e) => e.stopPropagation()}>
                      Read full article <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); investigateNews(article.title); }}
                      disabled={agentLoading}
                      className="flex items-center gap-1.5 text-xs glass px-3 py-1.5 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Microscope className="w-3.5 h-3.5" /> Research
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Remaining articles */}
            {news.slice(1).map((article) => (
              <motion.div
                key={article.url}
                className="glass rounded-3xl overflow-hidden group border border-transparent hover:border-white/10 transition flex flex-col"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="relative w-full h-44 overflow-hidden flex-shrink-0">
                  {article.imageUrl.startsWith('data:') || failedImages.has(article.url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover" />
                  ) : (
                    <Image
                      src={article.imageUrl} alt={article.title} fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={() => setFailedImages((prev) => new Set(prev).add(article.url))}
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
                    <a href={article.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-zinc-600 hover:text-white transition" onClick={(e) => e.stopPropagation()}>
                      Read more <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); investigateNews(article.title); }}
                      disabled={agentLoading}
                      className="flex items-center gap-1.5 text-xs glass px-2.5 py-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Microscope className="w-3 h-3" /> Research
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* ── Floating AI Assistant ─────────────────────────────────────────── */}
      <div className="fixed bottom-4 right-4 sm:bottom-8 sm:right-8 z-50 flex flex-col items-end">

        {/* Chat panel */}
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ y: 16, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 16, opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              className="glass rounded-3xl overflow-hidden shadow-2xl shadow-black/80 w-[calc(100vw-2rem)] sm:w-[400px] mb-4 origin-bottom-right"
            >
              {/* Header */}
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                  <span className="font-medium">Intelligent Engine</span>
                  <span className="text-xs text-emerald-400 animate-pulse ml-1">● Online</span>
                </div>
                <button
                  onClick={() => { setIsChatOpen(false); triggerSentient(0.3); }}
                  className="p-1 rounded-full hover:bg-white/10 transition text-zinc-400 hover:text-white"
                  aria-label="Close chat"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Messages */}
              <div
                ref={chatScrollRef}
                className="h-72 sm:h-96 p-5 overflow-y-auto text-sm space-y-3"
              >
                {chatHistory.length === 0 && (
                  <div className="text-zinc-500 text-center py-8">
                    <p>Ask about digital income opportunities in South Africa.</p>
                    <p className="text-xs mt-2 text-zinc-600">Powered by Scout Agent + Groq</p>
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <motion.div key={i} className={msg.role === 'user' ? 'text-right' : 'text-left'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <div className={`inline-block px-4 py-2 rounded-2xl max-w-[85%] text-left whitespace-pre-wrap text-sm ${msg.role === 'user' ? 'bg-blue-500/20 text-blue-100 border border-blue-500/30' : 'bg-white/5 border border-white/5'}`}>
                      {msg.content}
                    </div>
                  </motion.div>
                ))}
                {agentLoading && (
                  <motion.div className="text-left" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="inline-block px-4 py-2 rounded-2xl bg-white/5 text-zinc-500 animate-pulse text-sm">
                      Synthesizing data...
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Input */}
              <div className="p-4 border-t border-white/10 bg-black/20 flex gap-2">
                <input
                  id="ai-chat-input"
                  type="text"
                  value={aiMessage}
                  onChange={(e) => setAiMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToAIAssistant(); } }}
                  placeholder="Ask about opportunities..."
                  className="flex-1 bg-transparent focus:outline-none text-sm px-2"
                  disabled={agentLoading}
                />
                <button
                  onClick={() => sendToAIAssistant()}
                  disabled={agentLoading || !aiMessage.trim()}
                  className="px-4 py-2 bg-white/10 rounded-xl hover:bg-white/20 transition disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Send
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FAB — visible when chat is closed */}
        <AnimatePresence>
          {!isChatOpen && (
            <motion.button
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              onClick={() => { setIsChatOpen(true); triggerSentient(0.5); }}
              className="relative glass p-4 rounded-full flex items-center gap-3 shadow-lg hover:shadow-blue-500/20 hover:border-blue-500/40 transition-all duration-300 group"
              aria-label="Open AI Scout"
            >
              <MessageSquare className="w-6 h-6 text-blue-400 group-hover:scale-110 transition-transform" />
              <span className="hidden sm:block font-medium pr-2 text-zinc-300 group-hover:text-white transition-colors">Ask AI Scout</span>
              {/* Online ping */}
              <span className="absolute top-1 right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Register Modal */}
      <AnimatePresence>
        {showRegister && (
          <motion.div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="glass w-full max-w-md rounded-3xl p-10 relative overflow-hidden" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
              <div className="liquid-reflection opacity-30" />
              <h3 className="text-3xl font-semibold mb-8">Create Account</h3>
              <input
                type="email" placeholder="your@email.com" value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                className="w-full glass px-6 py-4 rounded-2xl mb-6 focus:outline-none focus:ring-2 focus:ring-white/20"
              />
              <button onClick={handleRegister} className="w-full py-4 glass rounded-2xl text-lg font-medium hover:bg-white/10 transition">
                Join Now
              </button>
              <button onClick={() => setShowRegister(false)} className="mt-6 text-xs text-zinc-400 hover:text-white transition block mx-auto">
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
