'use client';

import { useState, useEffect, useTransition } from 'react';
import { BookOpen, Clock, RefreshCw, ArrowLeft, Tag, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import type { BlogPost } from '@/app/api/blogs/route';

const CATEGORY_COLORS: Record<string, string> = {
  'Freelancing': 'text-blue-400 bg-blue-500/10',
  'Digital Skills': 'text-purple-400 bg-purple-500/10',
  'Startups': 'text-orange-400 bg-orange-500/10',
  'Crypto & DeFi': 'text-yellow-400 bg-yellow-500/10',
  'E-commerce': 'text-emerald-400 bg-emerald-500/10',
};

function BlogCard({ post }: { post: BlogPost }) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = CATEGORY_COLORS[post.category] ?? 'text-zinc-400 bg-zinc-500/10';

  return (
    <motion.article
      layout
      className="glass rounded-2xl p-6 cursor-pointer hover:bg-white/10 transition"
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colorClass}`}>
              {post.category}
            </span>
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {post.readTime} min read
            </span>
          </div>
          <h2 className="text-xl font-semibold mb-2 leading-tight">{post.title}</h2>
          <p className="text-zinc-400 text-sm">{post.excerpt}</p>
        </div>
        <button className="text-zinc-500 hover:text-white transition mt-1 shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-line">{post.content}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {post.tags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 text-xs text-zinc-500 glass px-2 py-1 rounded-lg">
                    <Tag className="w-3 h-3" /> {tag}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

export default function BlogsPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('All');
  // Perf: filter change only re-renders the list — non-urgent, interruptible
  const [, startFilterTransition] = useTransition();

  const categories = ['All', ...Array.from(new Set(posts.map((p) => p.category)))];

  const filtered = activeFilter === 'All' ? posts : posts.filter((p) => p.category === activeFilter);

  const fetchPosts = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/blogs');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { posts: BlogPost[] };
      startFilterTransition(() => setPosts(json.posts ?? []));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchPosts(); }, []);

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans">
      <div className="max-w-5xl mx-auto px-8 pt-10 pb-6">
        <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white transition text-sm mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Apex
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-5xl font-semibold flex items-center gap-3">
              <BookOpen className="w-10 h-10 text-blue-400" /> Blogs
            </h1>
            <p className="text-zinc-400 mt-2 max-w-xl">
              AI-researched articles on SA digital income, updated every 30 minutes via Perplexity Sonar.
            </p>
          </div>
          <button
            onClick={() => void fetchPosts()}
            disabled={loading}
            className="glass mt-2 px-4 py-2 rounded-xl text-sm flex items-center gap-2 hover:bg-white/15 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 pb-20">
        {/* Category filter */}
        {posts.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-6">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => startFilterTransition(() => setActiveFilter(cat))}
                className={`px-3 py-1.5 rounded-xl text-sm transition ${
                  activeFilter === cat ? 'bg-white/20 text-white' : 'glass text-zinc-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {loading && posts.length === 0 && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="glass rounded-2xl p-6 animate-pulse h-32" />
              ))}
            </motion.div>
          )}

          {error && posts.length === 0 && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="glass rounded-2xl p-8 text-center text-zinc-400">
              <BookOpen className="w-8 h-8 mx-auto mb-3 text-red-400" />
              <p>Unable to load blog posts. Check your API configuration.</p>
              <button onClick={() => void fetchPosts()} className="mt-4 glass px-4 py-2 rounded-xl text-sm hover:bg-white/15 transition">
                Try again
              </button>
            </motion.div>
          )}

          {filtered.length > 0 && (
            <motion.div key="posts" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="space-y-4">
              {filtered.map((post) => (
                <BlogCard key={post.id} post={post} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
