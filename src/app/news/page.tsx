'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, ExternalLink, Filter, Microscope, Newspaper, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

interface NewsArticle {
  title: string;
  url: string;
  snippet: string;
  date: string | null;
  source: string;
  imageUrl: string;
}

const NEWS_CATEGORIES = ['Latest', 'Tech & AI', 'Finance & Crypto', 'Startups'] as const;
type NewsCategory = typeof NEWS_CATEGORIES[number];

export default function NewsPage() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<NewsCategory>('Latest');
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const fetchNews = useCallback(async (category: NewsCategory) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/news?category=${encodeURIComponent(category)}`);
      const data = await res.json() as { articles?: NewsArticle[] };
      if (!res.ok || !Array.isArray(data.articles)) {
        setError(true);
        return;
      }
      setArticles(data.articles);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNews(activeCategory);
  }, [activeCategory, fetchNews]);

  const investigateNews = (articleTitle: string) => {
    const prompt = `Research the following news topic and explain its relevance to South African digital income opportunities:\n\n"${articleTitle}"\n\nProvide: 1) Key insights, 2) Potential opportunities, 3) Actionable next steps.`;
    router.push(`/opportunities?prompt=${encodeURIComponent(prompt)}`);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans">
      <div className="max-w-6xl mx-auto px-8 pt-10 pb-20">
        <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white transition text-sm mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Apex
        </Link>

        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="text-5xl font-semibold flex items-center gap-3">
              <Newspaper className="w-10 h-10 text-blue-400" /> News
            </h1>
            <p className="text-zinc-400 mt-2 max-w-3xl">
              Live South African digital economy news with category filters and direct handoff into the Scout Assistant for deeper research.
            </p>
          </div>

          <button
            onClick={() => void fetchNews(activeCategory)}
            disabled={loading}
            className="glass px-4 py-2 rounded-xl text-sm flex items-center gap-2 hover:bg-white/15 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="flex items-center gap-2 mb-8 flex-wrap">
          <Filter className="w-4 h-4 text-zinc-500 shrink-0" />
          {NEWS_CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-4 py-1.5 rounded-full text-sm transition ${
                activeCategory === category
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-zinc-400 hover:text-white hover:bg-white/8'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {loading && articles.length === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="glass rounded-3xl overflow-hidden animate-pulse">
                <div className="bg-white/5 h-44 w-full" />
                <div className="p-5 space-y-3">
                  <div className="bg-white/5 h-5 rounded w-full" />
                  <div className="bg-white/5 h-5 rounded w-4/5" />
                  <div className="bg-white/5 h-4 rounded w-full" />
                  <div className="bg-white/5 h-4 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="glass p-10 rounded-3xl text-center text-zinc-500">
            <Newspaper className="w-10 h-10 mx-auto mb-4 text-zinc-600" />
            <p className="text-lg mb-2">News unavailable</p>
            <p className="text-sm mb-6">Add PERPLEXITY_API_KEY to enable live news.</p>
            <button
              onClick={() => void fetchNews(activeCategory)}
              className="glass px-6 py-2 rounded-2xl text-sm hover:bg-white/10 transition"
            >
              Try again
            </button>
          </div>
        )}

        {!error && articles.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map((article, index) => (
              <motion.article
                key={article.url}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className={`glass rounded-3xl overflow-hidden group border border-transparent hover:border-white/10 transition flex flex-col ${index === 0 ? 'md:col-span-2 lg:col-span-2' : ''}`}
              >
                <div className={`relative w-full overflow-hidden flex-shrink-0 ${index === 0 ? 'h-56' : 'h-44'}`}>
                  {article.imageUrl.startsWith('data:') || failedImages.has(article.url) ? (
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
                      sizes={index === 0 ? '(max-width: 768px) 100vw, 66vw' : '(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw'}
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={() => {
                        setFailedImages((prev) => new Set(prev).add(article.url));
                      }}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
                </div>

                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <span className="text-xs text-blue-400 font-medium uppercase tracking-wider">{article.source}</span>
                    {article.date && (
                      <span className="flex items-center gap-1 text-xs text-zinc-500">
                        <Clock className="w-3 h-3" />
                        {new Date(article.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: index === 0 ? 'numeric' : undefined })}
                      </span>
                    )}
                  </div>

                  <h2 className={`font-semibold leading-snug mb-2 group-hover:text-blue-300 transition ${index === 0 ? 'text-xl line-clamp-2' : 'text-base line-clamp-3 flex-1'}`}>
                    {article.title}
                  </h2>
                  <p className={`text-zinc-400 leading-relaxed ${index === 0 ? 'text-sm line-clamp-2' : 'text-xs line-clamp-2 mb-3'}`}>
                    {article.snippet}
                  </p>

                  <div className="flex items-center justify-between mt-auto gap-3">
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
                      className="flex items-center gap-1.5 text-xs glass px-3 py-1.5 rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition"
                      title="Research this article with AI"
                    >
                      <Microscope className="w-3.5 h-3.5" />
                      Research
                    </button>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
