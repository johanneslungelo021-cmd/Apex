'use client';

import { useState, useEffect, useTransition } from 'react';
import { Play, RefreshCw, ArrowLeft, Hash, Clock, TrendingUp, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import type { ReelIdea } from '@/app/api/reels/route';

const PLATFORM_COLORS: Record<string, string> = {
  'TikTok': 'text-pink-400 bg-pink-500/10',
  'YouTube Shorts': 'text-red-400 bg-red-500/10',
  'Instagram Reels': 'text-purple-400 bg-purple-500/10',
  'All Platforms': 'text-emerald-400 bg-emerald-500/10',
};

function ReelCard({ idea }: { idea: ReelIdea }) {
  const [copied, setCopied] = useState<string | null>(null);
  const colorClass = PLATFORM_COLORS[idea.platform] ?? 'text-zinc-400 bg-zinc-500/10';

  const copyScript = async () => {
    await navigator.clipboard.writeText(idea.hook + '\n\n' + idea.script);
    setCopied('script');
    setTimeout(() => setCopied(null), 2000);
  };

  const copyHashtags = async () => {
    await navigator.clipboard.writeText(idea.hashtags.map((h) => `#${h}`).join(' '));
    setCopied('hashtags');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-6"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colorClass}`}>
              {idea.platform}
            </span>
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {idea.duration}s
            </span>
            {idea.trending && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full text-yellow-400 bg-yellow-500/10 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Trending
              </span>
            )}
          </div>
          <h2 className="text-lg font-semibold leading-tight">{idea.title}</h2>
          <p className="text-xs text-zinc-500 mt-1">{idea.niche}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-zinc-500">Est. views</p>
          <p className="text-sm font-medium text-emerald-400">{idea.estimatedViews}</p>
        </div>
      </div>

      {/* Hook */}
      <div className="bg-white/5 rounded-xl p-4 mb-3">
        <p className="text-xs text-zinc-500 mb-1 font-medium uppercase tracking-wide">Hook (first 3 seconds)</p>
        <p className="text-sm text-white leading-relaxed">{idea.hook}</p>
      </div>

      {/* Script */}
      <div className="bg-white/5 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Script Outline</p>
          <button
            onClick={() => void copyScript()}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition"
          >
            {copied === 'script' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied === 'script' ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-sm text-zinc-300 leading-relaxed">{idea.script}</p>
      </div>

      {/* Hashtags + earning */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-1 mb-2">
            <Hash className="w-3.5 h-3.5 text-zinc-500" />
            <button
              onClick={() => void copyHashtags()}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition"
            >
              {copied === 'hashtags' ? <><Check className="w-3 h-3 text-emerald-400" /> Copied!</> : 'Copy hashtags'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {idea.hashtags.map((tag) => (
              <span key={tag} className="text-xs text-zinc-500 glass px-2 py-0.5 rounded-lg">
                #{tag}
              </span>
            ))}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-zinc-500">Earning potential</p>
          <p className="text-xs font-medium text-emerald-400">{idea.earningPotential}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default function ReelsPage() {
  const [ideas, setIdeas] = useState<ReelIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [platform, setPlatform] = useState<string>('All');
  // Perf: platform filter re-renders the ideas list — non-urgent, interruptible
  // isPending keeps skeleton visible until the deferred ideas state commits
  const [isPending, startPlatformTransition] = useTransition();

  const platforms = ['All', 'TikTok', 'YouTube Shorts', 'Instagram Reels', 'All Platforms'];
  const filtered = platform === 'All' ? ideas : ideas.filter((i) => i.platform === platform);

  const fetchIdeas = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/reels');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { ideas: ReelIdea[] };
      startPlatformTransition(() => setIdeas(json.ideas ?? []));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchIdeas(); }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans">
      <div className="max-w-5xl mx-auto px-8 pt-10 pb-6">
        <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white transition text-sm mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Apex
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-5xl font-semibold flex items-center gap-3">
              <Play className="w-10 h-10 text-red-400" /> Reels
            </h1>
            <p className="text-zinc-400 mt-2 max-w-xl">
              AI-generated video scripts and viral ideas for SA content creators. Ready to film.
            </p>
          </div>
          <button
            onClick={() => void fetchIdeas()}
            disabled={loading}
            className="glass mt-2 px-4 py-2 rounded-xl text-sm flex items-center gap-2 hover:bg-white/15 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> New Ideas
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 pb-20">
        {/* Platform filter */}
        {ideas.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-6">
            {platforms.map((p) => (
              <button
                key={p}
                onClick={() => startPlatformTransition(() => setPlatform(p))}
                className={`px-3 py-1.5 rounded-xl text-sm transition ${
                  platform === p ? 'bg-white/20 text-white' : 'glass text-zinc-400 hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* Fix: use (loading || isPending) so skeleton shows until transition commits */}
          {(loading || isPending) && ideas.length === 0 && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass rounded-2xl p-6 animate-pulse h-48" />
              ))}
            </motion.div>
          )}

          {error && ideas.length === 0 && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="glass rounded-2xl p-8 text-center text-zinc-400">
              <Play className="w-8 h-8 mx-auto mb-3 text-red-400" />
              <p>Unable to load reel ideas. Check your API configuration.</p>
              <button onClick={() => void fetchIdeas()} className="mt-4 glass px-4 py-2 rounded-xl text-sm hover:bg-white/15 transition">
                Try again
              </button>
            </motion.div>
          )}

          {filtered.length > 0 && (
            <motion.div key="ideas" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="space-y-4">
              {filtered.map((idea) => (
                <ReelCard key={idea.id} idea={idea} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
