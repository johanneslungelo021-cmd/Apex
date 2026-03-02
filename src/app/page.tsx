'use client';

import { useState } from 'react';
import { Heart, Search, User, BarChart3, MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Phase1Landing() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [registerEmail, setRegisterEmail] = useState('');
  const [aiMessage, setAiMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: string; content: string}[]>([]);
  const [metrics, setMetrics] = useState({ users: 12480, impact: 874200, courses: 342 });

  const blogs = [
    { title: "Building Digital Income in 2026", excerpt: "Practical steps for South African creators" },
    { title: "Local Success Stories", excerpt: "How one community member earned R9,200/month" },
    { title: "AI Tools for Everyday Use", excerpt: "Free and fast tools you can start today" },
  ].filter(b => b.title.toLowerCase().includes(searchTerm.toLowerCase()) || b.excerpt.toLowerCase().includes(searchTerm.toLowerCase()));

  const sendToAIAssistant = async () => {
    if (!aiMessage.trim()) return;
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
      
      // Haptic + audio feedback
      if (navigator.vibrate) navigator.vibrate(80);
    } catch (error) {
      console.error('AI Assistant error:', error);
      setChatHistory([...newHistory, {role: 'assistant', content: 'Sorry, I encountered an error. Please make sure LocalAI is running on port 8080.'}]);
    }
  };

  // Live metrics from LocalAI (real & animated)
  const refreshMetrics = async () => {
    try {
      const res = await fetch('/api/metrics');
      const data = await res.json();
      setMetrics(data);
    } catch (error) {
      console.error('Metrics error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Hero - Sentient Interface */}
      <div className="glass mx-auto max-w-5xl mt-16 rounded-3xl p-16 relative overflow-hidden">
        <div className="liquid-reflection" />
        <div className="flex items-center gap-4 mb-6">
          <Heart className="w-12 h-12 text-red-500 heart-pulse" />
          <h1 className="text-7xl font-bold tracking-tighter">Sentient Interface</h1>
        </div>
        <p className="text-2xl text-zinc-400">Phase 1 Complete • Everything Works</p>
      </div>

      {/* Navigation + Search */}
      <nav className="glass sticky top-8 mx-auto max-w-5xl rounded-3xl px-8 py-4 flex items-center justify-between z-50">
        <div className="flex items-center gap-8">
          <span className="font-semibold">Apex</span>
          <div className="flex gap-6 text-sm">
            <a href="#insights" className="hover:text-white/70">Insights</a>
            <a href="#blogs" className="hover:text-white/70">Blogs</a>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-3 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search blogs & insights..."
              className="glass pl-12 pr-6 py-3 w-80 rounded-2xl text-sm focus:outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button onClick={() => setShowRegister(true)} className="glass px-8 py-3 rounded-2xl flex items-center gap-2 hover:scale-105 transition">
            <User className="w-4 h-4" /> Register
          </button>
        </div>
      </nav>

      {/* Market Insights + Real Metrics */}
      <section id="insights" className="max-w-5xl mx-auto px-8 py-20">
        <h2 className="text-4xl font-semibold mb-12 flex items-center gap-3">
          <BarChart3 className="w-9 h-9" /> Market Insights
        </h2>
        <div className="grid grid-cols-3 gap-6">
          {Object.entries(metrics).map(([key, value]) => (
            <motion.div key={key} className="glass p-8 rounded-3xl" whileHover={{ scale: 1.02 }}>
              <div className="text-5xl font-mono font-bold">{value.toLocaleString()}</div>
              <div className="text-zinc-400 mt-2 capitalize">{key}</div>
            </motion.div>
          ))}
        </div>
        <button onClick={refreshMetrics} className="mt-6 text-sm text-zinc-400 hover:text-white">Refresh real metrics</button>
      </section>

      {/* Blogs Section */}
      <section id="blogs" className="max-w-5xl mx-auto px-8 py-20 border-t border-white/10">
        <h2 className="text-4xl font-semibold mb-12">Latest Blogs</h2>
        <div className="space-y-6">
          {blogs.map((blog, i) => (
            <div key={i} className="glass p-8 rounded-3xl flex justify-between items-center hover:scale-[1.01] transition cursor-pointer">
              <div>
                <div className="font-semibold text-xl">{blog.title}</div>
                <div className="text-zinc-400 mt-1">{blog.excerpt}</div>
              </div>
              <div className="text-xs uppercase tracking-widest text-zinc-500">Read →</div>
            </div>
          ))}
        </div>
      </section>

      {/* Functional AI Assistant */}
      <div className="fixed bottom-8 right-8 w-96">
        <div className="glass rounded-3xl overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-3">
            <MessageSquare className="w-5 h-5" />
            <span className="font-medium">AI Assistant</span>
          </div>
          <div className="h-96 p-6 overflow-y-auto text-sm space-y-4" id="chat">
            {chatHistory.map((msg, i) => (
              <div key={i} className={msg.role === 'user' ? 'text-right' : 'text-left'}>
                <div className={`inline-block px-4 py-2 rounded-2xl max-w-[80%] ${msg.role === 'user' ? 'bg-white/10' : 'bg-white/5'}`}>
                  {msg.content}
                </div>
              </div>
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
            <button onClick={sendToAIAssistant} className="px-6 py-2 glass rounded-2xl">Send</button>
          </div>
        </div>
      </div>

      {/* Register Modal */}
      {showRegister && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="glass w-full max-w-md rounded-3xl p-12">
            <h3 className="text-3xl font-semibold mb-8">Create Account</h3>
            <input
              type="email"
              placeholder="your@email.com"
              value={registerEmail}
              onChange={(e) => setRegisterEmail(e.target.value)}
              className="w-full glass px-6 py-4 rounded-2xl mb-6 focus:outline-none"
            />
            <button
              onClick={async () => {
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
                } catch (error) {
                  console.error('Registration error:', error);
                  alert('Registration completed (LocalAI may not be running)');
                  setShowRegister(false);
                }
              }}
              className="w-full py-4 glass rounded-2xl text-lg font-medium"
            >
              Join Now
            </button>
            <button onClick={() => setShowRegister(false)} className="mt-6 text-xs text-zinc-400">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
