'use client';

import { useState, useEffect, useCallback } from 'react';
import { Heart, Search, User, BarChart3, MessageSquare, Github, Star, GitFork, Eye, AlertCircle, BookOpen, TrendingUp, Users, DollarSign, Zap, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * GitHub repository metrics from the GitHub API.
 */
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

/**
 * Platform-specific metrics (users, impact, courses).
 */
interface PlatformMetrics {
  users: number;
  impact: number;
  courses: number;
}

/**
 * Combined metrics response from /api/metrics endpoint.
 */
interface CombinedMetrics {
  github: GitHubMetrics;
  platform: PlatformMetrics;
  timestamp: number;
}

/**
 * Digital income opportunity from the Scout Agent.
 */
interface Opportunity {
  title: string;
  province: string;
  cost: number;
  incomePotential: string;
  link: string;
  category: string;
}

/**
 * Main Sentient Interface component for the Apex platform.
 *
 * Features:
 * - Liquid Glass UI design with haptic and spatial audio feedback
 * - Real-time GitHub metrics integration
 * - AI-powered Intelligent Engine with Scout Agent
 * - Live digital income opportunities for South Africans
 * - User registration with PII-safe logging
 *
 * @returns The Sentient Interface React component
 */
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

  /**
   * Blog posts for the Latest Blogs section.
   * Filtered by search term.
   */
  const blogs = [
    { title: "Building Digital Income in 2026", excerpt: "Practical steps for South African creators" },
    { title: "Local Success Stories", excerpt: "How one community member earned R9,200/month" },
    { title: "AI Tools for Everyday Use", excerpt: "Free and fast tools you can start today" },
    { title: "GitHub Integration Guide", excerpt: "Connect your repos for real-time metrics" },
    { title: "Sentient Interface Design", excerpt: "Building responsive, living UIs with Liquid Glass" },
  ].filter(b =>
    b.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.excerpt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  /**
   * Triggers sentient feedback: haptic vibration and spatial audio pulse.
   *
   * On mobile devices, triggers vibration patterns. Creates spatial audio
   * using Web Audio API with random panning. Updates heartbeat visual intensity.
   *
   * @param intensity - Feedback intensity multiplier (default: 1)
   */
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

  /**
   * Initialize page view tracking and metrics refresh on mount.
   */
  useEffect(() => {
    fetch('/api/analytics', { method: 'POST' }).catch(() => {});
    refreshMetrics();
    const interval = setInterval(refreshMetrics, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  /**
   * Fetches fresh metrics from the /api/metrics endpoint.
   */
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

  /**
   * Sends a message to the Intelligent Engine (/api/ai-agent).
   *
   * Includes live Scout Agent data in the response. Updates chat history
   * and opportunities panel when new opportunities are returned.
   */
  const sendToAIAssistant = async () => {
    if (!aiMessage.trim() || agentLoading) return;

    triggerSentient(1.2);

    const userMsg = { role: 'user', content: aiMessage };
    const newHistory = [...chatHistory, userMsg];
    setChatHistory(newHistory);
    setAiMessage('');
    setAgentLoading(true);

    // Build messages array for the agent (exclude system messages from history)
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
        // Update opportunities panel if the agent returned fresh ones
        if (Array.isArray(data.opportunities) && data.opportunities.length > 0) {
          setOpportunities(data.opportunities);
        }
      }
      triggerSentient(0.8);
    } catch (error) {
      console.error('AI Agent error:', error);
      setChatHistory([...newHistory, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    } finally {
      setAgentLoading(false);
    }
  };

  /**
   * Handles user registration form submission.
   */
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
      } else {
        alert(data.message || 'Registration failed. Please check your email and try again.');
      }
      setShowRegister(false);
      triggerSentient(1);
    } catch (error) {
      console.error('Registration error:', error);
      alert('Registration failed. Please try again.');
      setShowRegister(false);
    }
  };

  /**
   * Formats large numbers with K/M suffixes.
   *
   * @param num - Number to format
   * @returns Formatted string (e.g., "1.5K", "2.3M")
   */
  const formatNumber = (num: number): string => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return num.toString();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* Hero */}
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

      {/* GEO Answer-First Block — human-readable + AI-crawler-readable summary */}
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

      {/* Navigation + Search */}
      <nav className="glass sticky top-8 mx-auto max-w-5xl rounded-3xl px-8 py-4 flex items-center justify-between z-50">
        <div className="flex items-center gap-8">
          <span className="font-semibold">Apex</span>
          <div className="flex gap-6 text-sm">
            <a href="#opportunities" className="hover:text-white/70 transition" onClick={() => triggerSentient(0.5)}>Opportunities</a>
            <a href="#insights" className="hover:text-white/70 transition" onClick={() => triggerSentient(0.5)}>Insights</a>
            <a href="#github" className="hover:text-white/70 transition" onClick={() => triggerSentient(0.5)}>GitHub</a>
            <a href="#blogs" className="hover:text-white/70 transition" onClick={() => triggerSentient(0.5)}>Blogs</a>
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

      {/* Live Opportunities Section */}
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
            <p className="text-sm mt-2">Try: "Find me a digital income opportunity in Gauteng under R2000"</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {opportunities.map((opp, i) => (
              <motion.a
                key={i}
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

      {/* GitHub Metrics Section */}
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
          <button onClick={() => { refreshMetrics(); triggerSentient(0.6); }} className="text-sm text-zinc-400 hover:text-white flex items-center gap-2 transition">
            <TrendingUp className="w-4 h-4" /> Refresh Metrics
          </button>
          {githubMetrics && (
            <span className="text-xs text-zinc-500">
              Last updated: {new Date(githubMetrics.lastUpdated).toLocaleString()}
            </span>
          )}
        </div>
      </section>

      {/* Market Insights Section */}
      <section id="insights" className="max-w-5xl mx-auto px-8 py-20 border-t border-white/10">
        <h2 className="text-4xl font-semibold mb-12 flex items-center gap-3">
          <BarChart3 className="w-9 h-9" /> Live Market Insights
        </h2>
        <div className="grid grid-cols-3 gap-6">
          {githubMetrics ? (
            <>
              <motion.div className="glass p-8 rounded-3xl cursor-pointer" whileHover={{ scale: 1.02 }} onClick={() => triggerSentient(0.6)}>
                <div className="text-5xl font-mono font-bold">{formatNumber(githubMetrics.stars)}</div>
                <div className="text-zinc-400 mt-2">GitHub Stars</div>
              </motion.div>
              <motion.div className="glass p-8 rounded-3xl cursor-pointer" whileHover={{ scale: 1.02 }} onClick={() => triggerSentient(0.6)}>
                <div className="text-5xl font-mono font-bold">{formatNumber(platformMetrics.users)}</div>
                <div className="text-zinc-400 mt-2">Platform Users</div>
              </motion.div>
              <motion.div className="glass p-8 rounded-3xl cursor-pointer" whileHover={{ scale: 1.02 }} onClick={() => triggerSentient(0.6)}>
                <div className="text-5xl font-mono font-bold">{formatNumber(platformMetrics.impact)}</div>
                <div className="text-zinc-400 mt-2">Total Impact (R)</div>
              </motion.div>
            </>
          ) : (
            Object.entries(platformMetrics).map(([key, value]) => (
              <motion.div key={key} className="glass p-8 rounded-3xl cursor-pointer" whileHover={{ scale: 1.02 }} onClick={() => triggerSentient(0.6)}>
                <div className="text-5xl font-mono font-bold">{formatNumber(value)}</div>
                <div className="text-zinc-400 mt-2 capitalize">{key}</div>
              </motion.div>
            ))
          )}
        </div>
      </section>

      {/* Blogs Section */}
      <section id="blogs" className="max-w-5xl mx-auto px-8 py-20 border-t border-white/10">
        <h2 className="text-4xl font-semibold mb-12">Latest Blogs</h2>
        <div className="space-y-6">
          {blogs.map((blog, i) => (
            <motion.div key={i} className="glass p-8 rounded-3xl flex justify-between items-center hover:scale-[1.01] transition cursor-pointer" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={() => triggerSentient(0.5)}>
              <div>
                <div className="font-semibold text-xl">{blog.title}</div>
                <div className="text-zinc-400 mt-1">{blog.excerpt}</div>
              </div>
              <div className="text-xs uppercase tracking-widest text-zinc-500">Read →</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* AI Assistant — powered by /api/ai-agent (Intelligent Engine) */}
      <div className="fixed bottom-8 right-8 w-96">
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
            {agentLoading && (
              <motion.div className="text-left" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="inline-block px-4 py-2 rounded-2xl bg-white/5 text-zinc-500">
                  Thinking...
                </div>
              </motion.div>
            )}
          </div>
          <div className="p-4 border-t border-white/10 flex gap-3">
            <input
              type="text"
              value={aiMessage}
              onChange={(e) => setAiMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendToAIAssistant()}
              placeholder="Ask about opportunities..."
              className="flex-1 bg-transparent focus:outline-none"
              disabled={agentLoading}
            />
            <button
              onClick={sendToAIAssistant}
              disabled={agentLoading || !aiMessage.trim()}
              className="px-6 py-2 glass rounded-2xl hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Register Modal */}
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
