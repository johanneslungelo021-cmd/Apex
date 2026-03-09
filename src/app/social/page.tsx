'use client';

import { useState } from 'react';
import { Share2, RefreshCw, ArrowLeft, Copy, Check, Calendar, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import type { SocialPackage, SocialPost } from '@/app/api/social/route';

const EXAMPLE_NICHES = [
  'Side Hustle Coach',
  'Township Food Business',
  'Digital Skills Tutor',
  'SA Crypto Trader',
  'Freelance Designer',
  'Online Tutor',
  'E-commerce Store',
];

const PLATFORM_COLORS: Record<string, string> = {
  'Twitter/X': 'text-sky-400',
  'LinkedIn': 'text-blue-400',
  'Facebook': 'text-indigo-400',
  'Instagram': 'text-pink-400',
  'TikTok': 'text-red-400',
};

function PostCard({ post }: { post: SocialPost }) {
  const [copied, setCopied] = useState(false);
  const colorClass = PLATFORM_COLORS[post.platform] ?? 'text-zinc-400';

  const copyCaption = async () => {
    const text = `${post.caption}\n\n${post.hashtags.map((h) => `#${h}`).join(' ')}\n\n${post.callToAction}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className={`text-sm font-semibold ${colorClass}`}>{post.platform}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">{post.bestPostTime}</span>
          <button
            onClick={() => void copyCaption()}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-white transition glass px-2 py-1 rounded-lg"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <p className="text-sm text-zinc-200 leading-relaxed mb-3">{post.caption}</p>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {post.hashtags.map((tag) => (
          <span key={tag} className="text-xs text-zinc-500 glass px-2 py-0.5 rounded-lg">#{tag}</span>
        ))}
      </div>

      <div className="border-t border-white/10 pt-3 space-y-1">
        <p className="text-xs text-zinc-400"><span className="text-zinc-600">CTA: </span>{post.callToAction}</p>
        <p className="text-xs text-zinc-400"><span className="text-zinc-600">Tip: </span>{post.engagementTip}</p>
      </div>
    </div>
  );
}

export default function SocialPage() {
  const [niche, setNiche] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SocialPackage | null>(null);

  const generate = async (nicheInput: string) => {
    if (!nicheInput.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: nicheInput.trim() }),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      const pkg = await res.json() as SocialPackage;
      setResult(pkg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans">
      <div className="max-w-5xl mx-auto px-8 pt-10 pb-6">
        <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white transition text-sm mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Apex
        </Link>
        <h1 className="text-5xl font-semibold flex items-center gap-3 mb-2">
          <Share2 className="w-10 h-10 text-purple-400" /> Social Media
        </h1>
        <p className="text-zinc-400 max-w-xl mb-8">
          Generate ready-to-post SA-voice content for your business. Enter your niche and get captions, hashtags, and a weekly calendar.
        </p>

        {/* Input */}
        <div className="glass rounded-2xl p-6 mb-6">
          <p className="text-sm text-zinc-400 mb-3">What is your business or niche?</p>
          <div className="flex gap-3">
            <input
              type="text"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void generate(niche); }}
              placeholder="e.g. Side Hustle Coach, Township Restaurant, Online Tutor..."
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/30 transition"
            />
            <button
              onClick={() => void generate(niche)}
              disabled={loading || !niche.trim()}
              className="glass px-5 py-3 rounded-xl text-sm flex items-center gap-2 hover:bg-white/15 transition disabled:opacity-40"
            >
              {loading
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Generating...</>
                : <><Sparkles className="w-3.5 h-3.5" /> Generate</>
              }
            </button>
          </div>

          {/* Quick-pick niches */}
          <div className="flex flex-wrap gap-2 mt-3">
            {EXAMPLE_NICHES.map((n) => (
              <button
                key={n}
                onClick={() => { setNiche(n); void generate(n); }}
                className="text-xs glass px-3 py-1.5 rounded-xl text-zinc-400 hover:text-white transition"
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="glass rounded-2xl p-5 mb-6 text-red-400 text-sm">
              {error}
            </motion.div>
          )}

          {loading && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="glass rounded-2xl p-6 animate-pulse h-40" />
              ))}
            </motion.div>
          )}

          {result && (
            <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-6">
              <h2 className="text-2xl font-semibold">Content for: <span className="text-purple-400">{result.niche}</span></h2>

              {/* Posts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {result.posts?.map((post, i) => (
                  <PostCard key={i} post={post} />
                ))}
              </div>

              {/* Weekly calendar */}
              {result.weeklyCalendar && result.weeklyCalendar.length > 0 && (
                <div className="glass rounded-2xl p-6">
                  <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <Calendar className="w-5 h-5 text-purple-400" /> Weekly Posting Calendar
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
                    {result.weeklyCalendar.map((day, i) => (
                      <div key={i} className="bg-white/5 rounded-xl p-3 text-center">
                        <p className="text-xs font-semibold text-zinc-400 mb-1">{day.day}</p>
                        <p className="text-xs text-zinc-300 leading-tight">{day.theme}</p>
                        <p className="text-xs text-zinc-600 mt-1">{day.platform}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
