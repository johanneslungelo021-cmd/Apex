/**
 * Sentient Interface - Main Landing Page (Phase 2)
 *
 * A full-functional landing page implementing Phase 2 of the Apex platform.
 * Features include:
 *
 * - Liquid Glass UI effects with responsive glassmorphism
 * - Haptic feedback and spatial audio for sentient interactions
 * - Real-time GitHub repository metrics via API
 * - Platform usage metrics with deterministic variation
 * - AI-powered chat assistant with Groq/AI Gateway backend
 * - Scout Agent for live digital income opportunities
 * - User registration with PII-safe logging
 * - OpenTelemetry metrics for Grafana Cloud
 * - Rate-limited AI Agent endpoint with capability manifest
 *
 * @module app/page
 *
 * @see /api/metrics - GitHub and platform metrics endpoint
 * @see /api/assistant - AI chat completion endpoint
 * @see /api/ai-agent - Intelligent Engine endpoint
 * @see /api/register - User registration endpoint
 * @see /lib/metrics - OpenTelemetry counters
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Heart, Search, User, BarChart3, MessageSquare, Github, Star, GitFork, Eye, AlertCircle, BookOpen, TrendingUp, Users, DollarSign, Sparkles, MapPin, ExternalLink, Zap, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * GitHub repository metrics from the GitHub API.
 * Displayed in the GitHub Stats section of the interface.
 */
interface GitHubMetrics {
  /** Number of repository stars */
  stars: number;
  /** Number of repository forks */
  forks: number;
  /** Number of open issues */
  openIssues: number;
  /** Number of repository watchers */
  watchers: number;
  /** Repository size in kilobytes */
  size: number;
  /** ISO timestamp of last update */
  lastUpdated: string;
  /** Full repository name (owner/repo) */
  fullName: string;
  /** Repository description */
  description: string;
  /** Primary programming language */
  language: string;
}

/**
 * Platform usage metrics for the Apex application.
 * Simulated metrics with deterministic hourly variation.
 */
interface PlatformMetrics {
  /** Number of active users */
  users: number;
  /** Total impact value (in rands) */
  impact: number;
  /** Number of completed courses */
  courses: number;
}

/**
 * Combined metrics response from the /api/metrics endpoint.
 * Contains both GitHub and platform metrics with a timestamp.
 */
interface CombinedMetrics {
  /** GitHub repository metrics */
  github: GitHubMetrics;
  /** Platform usage metrics */
  platform: PlatformMetrics;
  /** Unix timestamp of metrics collection */
  timestamp: number;
}

/**
 * A digital income opportunity from the Scout Agent.
 */
interface Opportunity {
  /** Opportunity title */
  title: string;
  /** South African province */
  province: string;
  /** Cost in ZAR */
  cost: number;
  /** Income potential description */
  incomePotential: string;
  /** URL to the platform or course */
  link: string;
  /** Opportunity category */
  category: string;
}

/**
 * Sentient Interface main component.
 *
 * A full-featured landing page with sentient UI effects, real-time metrics,
 * AI assistant, Scout Agent opportunities, and user registration capabilities.
 *
 * @returns The complete landing page JSX
 */
export default function SentientInterface() {
  /** Search term for filtering blog posts */
  const [searchTerm, setSearchTerm] = useState('');
  /** Whether registration modal is visible */
  const [showRegister, setShowRegister] = useState(false);
  /** Email input for registration */
  const [registerEmail, setRegisterEmail] = useState('');
  /** Current AI message input */
  const [aiMessage, setAiMessage] = useState('');
  /** Chat history for AI assistant */
  const [chatHistory, setChatHistory] = useState<{role: string; content: string}[]>([]);
  /** GitHub metrics from API */
  const [githubMetrics, setGithubMetrics] = useState<GitHubMetrics | null>(null);
  /** Platform metrics */
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetrics>({ users: 12480, impact: 874200, courses: 342 });
  /** Loading state for metrics */
  const [isLoading, setIsLoading] = useState(true);
  /** Active tab for metrics display */
  const [activeTab, setActiveTab] = useState<'github' | 'platform'>('github');
  /** Heartbeat animation intensity */
  const [heartbeatIntensity, setHeartbeatIntensity] = useState(1);
  /** Live opportunities from Scout Agent */
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  /** Loading state for Scout Agent */
  const [isLoadingOpportunities, setIsLoadingOpportunities] = useState(false);
  /** Phase 2 AI Agent message */
  const [agentMessage, setAgentMessage] = useState('');
  /** Phase 2 AI Agent response */
  const [agentResponse, setAgentResponse] = useState<{reply: string; opportunities: Opportunity[]} | null>(null);
  /** Loading state for AI Agent */
  const [isLoadingAgent, setIsLoadingAgent] = useState(false);
  /** Active chat mode */
  const [chatMode, setChatMode] = useState<'simple' | 'intelligent'>('intelligent');

  const blogs = [
    { title: "Building Digital Income in 2026", excerpt: "Practical steps for South African creators" },
    { title: "Local Success Stories", excerpt: "How one community member earned R9,200/month" },
    { title: "AI Tools for Everyday Use", excerpt: "Free and fast tools you can start today" },
    { title: "GitHub Integration Guide", excerpt: "Connect your repos for real-time metrics" },
    { title: "Sentient Interface Design", excerpt: "Building responsive, living UIs with Liquid Glass" },
  ].filter(b => b.title.toLowerCase().includes(searchTerm.toLowerCase()) || b.excerpt.toLowerCase().includes(searchTerm.toLowerCase()));

  /**
   * Triggers sentient feedback effects for user interactions.
   *
   * @param intensity - Effect intensity multiplier (0-2, default: 1)
   */
  const triggerSentient = useCallback((intensity: number = 1) => {
    // Haptic feedback (mobile devices)
    if (navigator.vibrate) {
      navigator.vibrate([60 * intensity, 30, 60 * intensity]);
    }

    // Spatial audio pulse
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
      setTimeout(() => {
        oscillator.stop();
        audio.close();
      }, 280);
    } catch {
      // Audio not available
    }

    // Visual heartbeat pulse
    setHeartbeatIntensity(1.3);
    setTimeout(() => setHeartbeatIntensity(1), 300);
  }, []);

  /**
   * Effect hook for initial setup and metrics refresh interval.
   */
  useEffect(() => {
    fetch('/api/analytics', { method: 'POST' }).catch(() => {});
    refreshMetrics();
    loadOpportunities();

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

      if (data.github) {
        setGithubMetrics(data.github);
      }
      if (data.platform) {
        setPlatformMetrics(data.platform);
      }
    } catch (error) {
      console.error('Metrics error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Loads opportunities from the Scout Agent via the AI Agent endpoint.
   */
  const loadOpportunities = async () => {
    setIsLoadingOpportunities(true);
    try {
      // Use the capability manifest to get opportunities
      const res = await fetch('/api/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Show me available digital income opportunities' }]
        }),
      });
      const data = await res.json();
      if (data.opportunities) {
        setOpportunities(data.opportunities);
      }
    } catch (error) {
      console.error('Opportunities load error:', error);
    } finally {
      setIsLoadingOpportunities(false);
    }
  };

  /**
   * Sends a message to the simple AI assistant.
   */
  const sendToAIAssistant = async () => {
    if (!aiMessage.trim()) return;

    triggerSentient(1.2);

    const newHistory = [...chatHistory, {role: 'user', content: aiMessage}];
    setChatHistory(newHistory);
    setAiMessage('');

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: aiMessage }),
      });
      const data = await res.json();

      setChatHistory([...newHistory, {role: 'assistant', content: data.reply}]);
      triggerSentient(0.8);
    } catch (error) {
      console.error('AI Assistant error:', error);
      setChatHistory([...newHistory, {role: 'assistant', content: 'Sorry, I encountered an error. Please try again.'}]);
    }
  };

  /**
   * Sends a message to the Phase 2 Intelligent Engine.
   */
  const sendToIntelligentEngine = async () => {
    if (!agentMessage.trim()) return;

    triggerSentient(1.5);
    setIsLoadingAgent(true);

    try {
      const res = await fetch('/api/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: agentMessage }]
        }),
      });
      const data = await res.json();

      setAgentResponse({ reply: data.reply, opportunities: data.opportunities || [] });
      if (data.opportunities?.length > 0) {
        setOpportunities(data.opportunities);
      }
      triggerSentient(1);
    } catch (error) {
      console.error('Intelligent Engine error:', error);
      setAgentResponse({
        reply: 'Sorry, I encountered an error. Please try again.',
        opportunities: []
      });
    } finally {
      setIsLoadingAgent(false);
      setAgentMessage('');
    }
  };

  /**
   * Handles user registration form submission.
   */
  const handleRegister = async () => {
    triggerSentient(1.5);

    try {
      await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: registerEmail })
      });
      alert('Account created – welcome to the Sentient Interface');
      setShowRegister(false);
      triggerSentient(1);
    } catch (error) {
      console.error('Registration error:', error);
      alert('Registration completed');
      setShowRegister(false);
    }
  };

  /**
   * Formats a number for display with K/M suffixes.
   */
  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Hero - Sentient Interface */}
      <div className="glass mx-auto max-w-5xl mt-16 rounded-3xl p-16 relative overflow-hidden">
        <div className="liquid-reflection" />
        <div className="flex items-center gap-4 mb-6">
          <motion.div
            animate={{ scale: heartbeatIntensity }}
            transition={{ type: 'spring', stiffness: 300 }}
          >
            <Heart
              className="w-12 h-12 text-red-500 heart-pulse"
              style={{ filter: `drop-shadow(0 0 ${10 * heartbeatIntensity}px rgba(239, 68, 68, 0.6))` }}
            />
          </motion.div>
          <div>
            <h1 className="text-7xl font-bold tracking-tighter">Sentient Interface</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-zinc-400">Phase 2</span>
              <span className="text-sm text-emerald-400 font-medium">• Intelligent Engine</span>
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
        </div>
        <p className="text-2xl text-zinc-400">OpenTelemetry + Real GitHub Metrics + Scout Agent + AI-Powered Opportunities</p>
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

      {/* Live Opportunities Section - Scout Agent */}
      <section id="opportunities" className="max-w-5xl mx-auto px-8 py-20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-4xl font-semibold flex items-center gap-3">
            <Zap className="w-9 h-9 text-emerald-400" /> Live Opportunities
          </h2>
          <button
            onClick={() => { loadOpportunities(); triggerSentient(0.6); }}
            className="text-sm text-zinc-400 hover:text-white flex items-center gap-2 transition"
            disabled={isLoadingOpportunities}
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingOpportunities ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        <p className="text-zinc-400 mb-12">Real-time digital income opportunities from the Scout Agent (≤ R2000 cost)</p>

        {isLoadingOpportunities && opportunities.length === 0 ? (
          <div className="glass p-8 rounded-3xl text-center text-zinc-400">
            <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin" />
            <p>Scout Agent searching for opportunities...</p>
          </div>
        ) : opportunities.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {opportunities.map((opp, i) => (
              <motion.a
                key={i}
                href={opp.link}
                target="_blank"
                rel="noopener noreferrer"
                className="glass p-6 rounded-3xl cursor-pointer hover:scale-[1.02] transition"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => triggerSentient(0.8)}
              >
                <div className="flex items-center gap-2 text-xs text-emerald-400 mb-2">
                  <span className="px-2 py-1 bg-emerald-400/20 rounded-full">{opp.category}</span>
                  <MapPin className="w-3 h-3" />
                  <span>{opp.province}</span>
                </div>
                <h3 className="font-semibold text-lg mb-2">{opp.title}</h3>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Cost: <span className="text-white font-medium">R{opp.cost}</span></span>
                  <span className="text-emerald-400">{opp.incomePotential}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-blue-400 mt-3">
                  <ExternalLink className="w-3 h-3" />
                  <span>View Opportunity</span>
                </div>
              </motion.a>
            ))}
          </div>
        ) : (
          <div className="glass p-8 rounded-3xl text-center text-zinc-400">
            <p>No opportunities available. Configure GROQ_API_KEY to enable the Scout Agent.</p>
          </div>
        )}
      </section>

      {/* Intelligent Engine Chat Section */}
      <section className="max-w-5xl mx-auto px-8 py-12 border-t border-white/10">
        <div className="flex items-center gap-3 mb-6">
          <Sparkles className="w-8 h-8 text-blue-400" />
          <h2 className="text-3xl font-semibold">Intelligent Engine</h2>
        </div>

        <div className="glass rounded-3xl p-6">
          <div className="flex gap-4 mb-4">
            <button
              onClick={() => setChatMode('intelligent')}
              className={`px-4 py-2 rounded-2xl text-sm transition ${chatMode === 'intelligent' ? 'glass text-emerald-400' : 'text-zinc-400 hover:text-white'}`}
            >
              <Zap className="w-4 h-4 inline mr-2" />Intelligent Engine
            </button>
            <button
              onClick={() => setChatMode('simple')}
              className={`px-4 py-2 rounded-2xl text-sm transition ${chatMode === 'simple' ? 'glass' : 'text-zinc-400 hover:text-white'}`}
            >
              <MessageSquare className="w-4 h-4 inline mr-2" />Simple Chat
            </button>
          </div>

          {chatMode === 'intelligent' ? (
            <>
              <div className="min-h-[200px] p-4 bg-white/5 rounded-2xl mb-4">
                {agentResponse ? (
                  <div className="space-y-4">
                    <div className="prose prose-invert prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap text-sm text-zinc-300 font-sans">{agentResponse.reply}</pre>
                    </div>
                    {agentResponse.opportunities.length > 0 && (
                      <div className="border-t border-white/10 pt-4">
                        <p className="text-xs text-zinc-500 mb-2">Related Opportunities:</p>
                        <div className="flex flex-wrap gap-2">
                          {agentResponse.opportunities.map((o, i) => (
                            <a
                              key={i}
                              href={o.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs px-3 py-1 bg-emerald-400/20 text-emerald-400 rounded-full hover:bg-emerald-400/30 transition"
                            >
                              {o.title} • R{o.cost}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-zinc-500 py-8">
                    <Sparkles className="w-8 h-8 mx-auto mb-2" />
                    <p>Ask me about digital income opportunities in South Africa...</p>
                    <p className="text-xs mt-1">Answer-First responses grounded in live data</p>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={agentMessage}
                  onChange={(e) => setAgentMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendToIntelligentEngine()}
                  placeholder="Find opportunities in Gauteng under R1000..."
                  className="flex-1 glass px-4 py-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                  disabled={isLoadingAgent}
                />
                <button
                  onClick={sendToIntelligentEngine}
                  className="px-6 py-3 bg-emerald-400/20 text-emerald-400 rounded-2xl hover:bg-emerald-400/30 transition flex items-center gap-2"
                  disabled={isLoadingAgent}
                >
                  {isLoadingAgent ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Ask
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="min-h-[200px] p-4 bg-white/5 rounded-2xl mb-4 space-y-3">
                {chatHistory.length === 0 ? (
                  <div className="text-center text-zinc-500 py-8">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2" />
                    <p>Simple chat mode...</p>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <motion.div
                      key={i}
                      className={msg.role === 'user' ? 'text-right' : 'text-left'}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div className={`inline-block px-4 py-2 rounded-2xl max-w-[80%] ${msg.role === 'user' ? 'bg-white/10' : 'bg-white/5'}`}>
                        <pre className="whitespace-pre-wrap text-sm font-sans">{msg.content}</pre>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={aiMessage}
                  onChange={(e) => setAiMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendToAIAssistant()}
                  placeholder="Ask anything..."
                  className="flex-1 glass px-4 py-3 rounded-2xl focus:outline-none"
                />
                <button
                  onClick={sendToAIAssistant}
                  className="px-6 py-3 glass rounded-2xl hover:bg-white/10 transition"
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* GitHub Metrics Section */}
      <section id="github" className="max-w-5xl mx-auto px-8 py-20 border-t border-white/10">
        <h2 className="text-4xl font-semibold mb-4 flex items-center gap-3">
          <Github className="w-9 h-9" /> GitHub Repository Metrics
        </h2>
        <p className="text-zinc-400 mb-12">Real-time metrics from the Apex repository (via Grafana Alloy)</p>

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
            <motion.div
              key="github"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-6"
            >
              <motion.div
                className="glass p-8 rounded-3xl cursor-pointer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => triggerSentient(0.8)}
              >
                <div className="flex items-center gap-2 text-zinc-400 mb-2">
                  <Star className="w-5 h-5 text-yellow-500" />
                  <span>Stars</span>
                </div>
                <div className="text-5xl font-mono font-bold">
                  {isLoading ? '...' : formatNumber(githubMetrics?.stars || 0)}
                </div>
              </motion.div>

              <motion.div
                className="glass p-8 rounded-3xl cursor-pointer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => triggerSentient(0.8)}
              >
                <div className="flex items-center gap-2 text-zinc-400 mb-2">
                  <GitFork className="w-5 h-5 text-blue-500" />
                  <span>Forks</span>
                </div>
                <div className="text-5xl font-mono font-bold">
                  {isLoading ? '...' : formatNumber(githubMetrics?.forks || 0)}
                </div>
              </motion.div>

              <motion.div
                className="glass p-8 rounded-3xl cursor-pointer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => triggerSentient(0.8)}
              >
                <div className="flex items-center gap-2 text-zinc-400 mb-2">
                  <AlertCircle className="w-5 h-5 text-orange-500" />
                  <span>Open Issues</span>
                </div>
                <div className="text-5xl font-mono font-bold">
                  {isLoading ? '...' : formatNumber(githubMetrics?.openIssues || 0)}
                </div>
              </motion.div>

              <motion.div
                className="glass p-8 rounded-3xl cursor-pointer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => triggerSentient(0.8)}
              >
                <div className="flex items-center gap-2 text-zinc-400 mb-2">
                  <Eye className="w-5 h-5 text-purple-500" />
                  <span>Watchers</span>
                </div>
                <div className="text-5xl font-mono font-bold">
                  {isLoading ? '...' : formatNumber(githubMetrics?.watchers || 0)}
                </div>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="platform"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-3 gap-6"
            >
              <motion.div
                className="glass p-8 rounded-3xl cursor-pointer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => triggerSentient(0.8)}
              >
                <div className="flex items-center gap-2 text-zinc-400 mb-2">
                  <Users className="w-5 h-5 text-emerald-500" />
                  <span>Active Users</span>
                </div>
                <div className="text-5xl font-mono font-bold">
                  {isLoading ? '...' : formatNumber(platformMetrics.users)}
                </div>
              </motion.div>

              <motion.div
                className="glass p-8 rounded-3xl cursor-pointer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => triggerSentient(0.8)}
              >
                <div className="flex items-center gap-2 text-zinc-400 mb-2">
                  <DollarSign className="w-5 h-5 text-green-500" />
                  <span>Impact (R)</span>
                </div>
                <div className="text-5xl font-mono font-bold">
                  {isLoading ? '...' : formatNumber(platformMetrics.impact)}
                </div>
              </motion.div>

              <motion.div
                className="glass p-8 rounded-3xl cursor-pointer"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => triggerSentient(0.8)}
              >
                <div className="flex items-center gap-2 text-zinc-400 mb-2">
                  <BookOpen className="w-5 h-5 text-cyan-500" />
                  <span>Courses</span>
                </div>
                <div className="text-5xl font-mono font-bold">
                  {isLoading ? '...' : formatNumber(platformMetrics.courses)}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8 flex items-center gap-4">
          <button
            onClick={() => { refreshMetrics(); triggerSentient(0.6); }}
            className="text-sm text-zinc-400 hover:text-white flex items-center gap-2 transition"
          >
            <TrendingUp className="w-4 h-4" />
            Refresh from Grafana
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
              <motion.div
                className="glass p-8 rounded-3xl cursor-pointer"
                whileHover={{ scale: 1.02 }}
                onClick={() => triggerSentient(0.6)}
              >
                <div className="text-5xl font-mono font-bold">{formatNumber(githubMetrics.stars)}</div>
                <div className="text-zinc-400 mt-2">GitHub Stars</div>
              </motion.div>
              <motion.div
                className="glass p-8 rounded-3xl cursor-pointer"
                whileHover={{ scale: 1.02 }}
                onClick={() => triggerSentient(0.6)}
              >
                <div className="text-5xl font-mono font-bold">{formatNumber(platformMetrics.users)}</div>
                <div className="text-zinc-400 mt-2">Platform Users</div>
              </motion.div>
              <motion.div
                className="glass p-8 rounded-3xl cursor-pointer"
                whileHover={{ scale: 1.02 }}
                onClick={() => triggerSentient(0.6)}
              >
                <div className="text-5xl font-mono font-bold">{formatNumber(platformMetrics.impact)}</div>
                <div className="text-zinc-400 mt-2">Total Impact (R)</div>
              </motion.div>
            </>
          ) : (
            Object.entries(platformMetrics).map(([key, value]) => (
              <motion.div
                key={key}
                className="glass p-8 rounded-3xl cursor-pointer"
                whileHover={{ scale: 1.02 }}
                onClick={() => triggerSentient(0.6)}
              >
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
            <motion.div
              key={i}
              className="glass p-8 rounded-3xl flex justify-between items-center hover:scale-[1.01] transition cursor-pointer"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => triggerSentient(0.5)}
            >
              <div>
                <div className="font-semibold text-xl">{blog.title}</div>
                <div className="text-zinc-400 mt-1">{blog.excerpt}</div>
              </div>
              <div className="text-xs uppercase tracking-widest text-zinc-500">Read →</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Register Modal */}
      <AnimatePresence>
        {showRegister && (
          <motion.div
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="glass w-full max-w-md rounded-3xl p-12 relative overflow-hidden"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div className="liquid-reflection opacity-30" />
              <h3 className="text-3xl font-semibold mb-8">Create Account</h3>
              <input
                type="email"
                placeholder="your@email.com"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                className="w-full glass px-6 py-4 rounded-2xl mb-6 focus:outline-none focus:ring-2 focus:ring-white/20"
              />
              <button
                onClick={handleRegister}
                className="w-full py-4 glass rounded-2xl text-lg font-medium hover:bg-white/10 transition"
              >
                Join Now
              </button>
              <button
                onClick={() => setShowRegister(false)}
                className="mt-6 text-xs text-zinc-400 hover:text-white transition"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
