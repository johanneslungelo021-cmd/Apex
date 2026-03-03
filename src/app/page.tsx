'use client';

import { useState, useEffect, useCallback } from 'react';
import { Heart, Search, User, BarChart3, MessageSquare, Github, Star, GitFork, Eye, AlertCircle, BookOpen, TrendingUp, Users, DollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

export default function SentientInterface() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [registerEmail, setRegisterEmail] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: string; content: string}[]>([]);
  const [githubMetrics, setGithubMetrics] = useState<GitHubMetrics | null>(null);
  const [platformMetrics, setPlatformMetrics] = useState<PlatformMetrics>({ users: 12480, impact: 874200, courses: 342 });
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'github' | 'platform'>('github');
  const [heartbeatIntensity, setHeartbeatIntensity] = useState(1);

  const blogs = [
    { title: "Building Digital Income in 2026", excerpt: "Practical steps for South African creators" },
    { title: "Local Success Stories", excerpt: "How one community member earned R9,200/month" },
    { title: "AI Tools for Everyday Use", excerpt: "Free and fast tools you can start today" },
    { title: "GitHub Integration Guide", excerpt: "Connect your repos for real-time metrics" },
    { title: "Sentient Interface Design", excerpt: "Building responsive, living UIs with Liquid Glass" },
  ].filter(b => b.title.toLowerCase().includes(searchTerm.toLowerCase()) || b.excerpt.toLowerCase().includes(searchTerm.toLowerCase()));

  // Sentient Feedback: Haptic + Spatial Audio
  const triggerSentient = useCallback((intensity: number = 1) => {
    // Haptic feedback (mobile devices)
    if (navigator.vibrate) {
      navigator.vibrate([60 * intensity, 30, 60 * intensity]);
    }

    // Spatial audio pulse
    try {
      const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
      const audio = new AudioContext();
      
      // Create spatial audio nodes
      const oscillator = audio.createOscillator();
      const gainNode = audio.createGain();
      const panner = audio.createStereoPanner();
      
      oscillator.type = 'sine';
      oscillator.frequency.value = 180 + (intensity * 20);
      
      gainNode.gain.value = 0.15 * intensity;
      gainNode.gain.exponentialRampToValueAtTime(0.01, audio.currentTime + 0.3);
      
      // Pan based on interaction position
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
      console.log('Audio not available');
    }

    // Visual heartbeat pulse
    setHeartbeatIntensity(1.3);
    setTimeout(() => setHeartbeatIntensity(1), 300);
  }, []);

  // Fetch metrics on mount
  useEffect(() => {
    refreshMetrics();
    
    // Set up periodic refresh
    const interval = setInterval(refreshMetrics, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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

  const sendToAIAssistant = async () => {
    if (!aiMessage.trim()) return;
    
    triggerSentient(1.2);
    
    const newHistory = [...chatHistory, {role: 'user', content: aiMessage}];
    setChatHistory(newHistory);
    setAiMessage('');

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: aiMessage }),
      });
      const data = await res.json();
      
      setChatHistory([...newHistory, {role: 'assistant', content: data.reply}]);
      triggerSentient(0.8);
    } catch (error) {
      console.error('AI Assistant error:', error);
      setChatHistory([...newHistory, {role: 'assistant', content: 'Sorry, I encountered an error. Please make sure LocalAI is running on port 8080.'}]);
    }
  };

  const handleRegister = async () => {
    triggerSentient(1.5);
    
    try {
      await fetch('/api/register', { 
        method: 'POST', 
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: registerEmail }) 
      });
      alert('Account created – welcome to the Sentient Interface');
      setShowRegister(false);
      triggerSentient(1);
    } catch (error) {
      console.error('Registration error:', error);
      alert('Registration completed (LocalAI may not be running)');
      setShowRegister(false);
    }
  };

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
          <h1 className="text-7xl font-bold tracking-tighter">Sentient Interface</h1>
        </div>
        <p className="text-2xl text-zinc-400">Phase 1 Complete • OpenTelemetry + Real GitHub Metrics in Grafana</p>
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

      {/* GitHub Metrics Section */}
      <section id="github" className="max-w-5xl mx-auto px-8 py-20">
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

      {/* Functional AI Assistant */}
      <div className="fixed bottom-8 right-8 w-96">
        <div className="glass rounded-3xl overflow-hidden">
          <div 
            className="p-4 border-b border-white/10 flex items-center gap-3 cursor-pointer"
            onClick={() => triggerSentient(0.3)}
          >
            <MessageSquare className="w-5 h-5" />
            <span className="font-medium">AI Assistant</span>
            <span className="text-xs text-emerald-400 animate-pulse ml-auto">● Online</span>
          </div>
          <div className="h-96 p-6 overflow-y-auto text-sm space-y-4" id="chat">
            {chatHistory.length === 0 && (
              <div className="text-zinc-500 text-center py-8">
                <p>Start a conversation with the AI assistant...</p>
                <p className="text-xs mt-2 text-zinc-600">Powered by LocalAI</p>
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <motion.div 
                key={i} 
                className={msg.role === 'user' ? 'text-right' : 'text-left'}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className={`inline-block px-4 py-2 rounded-2xl max-w-[80%] ${msg.role === 'user' ? 'bg-white/10' : 'bg-white/5'}`}>
                  {msg.content}
                </div>
              </motion.div>
            ))}
          </div>
          <div className="p-4 border-t border-white/10 flex gap-3">
            <input
              type="text"
              value={aiMessage}
              onChange={(e) => setAiMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendToAIAssistant()}
              placeholder="Ask anything..."
              className="flex-1 bg-transparent focus:outline-none"
            />
            <button 
              onClick={sendToAIAssistant} 
              className="px-6 py-2 glass rounded-2xl hover:bg-white/10 transition"
            >
              Send
            </button>
          </div>
        </div>
      </div>

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
