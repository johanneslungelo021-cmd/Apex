/**
 * Sentient News Room + Live Resonance Matrix
 * src/app/news/page.tsx
 *
 * DATA SOURCES (zero mock):
 *   News articles  — GET /api/news?category=... → Perplexity Sonar
 *   AI vibe        — POST /api/ai-agent → streaming NDJSON
 *   Voice input    — useVoiceInput (Web Speech Recognition, en-ZA)
 *   Comment tags   — POST /api/ai-agent → JSON classification
 *
 * HOOK API (verified against src/hooks/):
 *   useVoiceInput()   → { isListening, isSupported, interimText, finalText, startListening, stopListening }
 *   useSpeech()       → { speak, stop, isAvailable }
 *   useEmotionEngine()→ { transition }
 *   useMultiSensory() → { trigger }
 */

'use client';

import {
  useCallback,
  useEffect,
  useState,
  useRef,
  useTransition,
  type CSSProperties,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, RefreshCw, Zap } from 'lucide-react';

import { useVoiceInput }    from '@/hooks/useVoiceInput';
import { useSpeech }        from '@/hooks/useSpeech';
import { useEmotionEngine, EmotionProvider } from '@/hooks/useEmotionEngine';
import { useMultiSensory }  from '@/hooks/useMultiSensory';
import type { NewsArticle } from '@/app/api/news/route';

type NewsCategory = 'Latest' | 'Tech & AI' | 'Finance & Crypto' | 'Startups';
const CATEGORIES: NewsCategory[] = ['Latest', 'Tech & AI', 'Finance & Crypto', 'Startups'];

type Sentiment = 'optimistic' | 'volatile' | 'analytical' | 'calm';

interface ResonanceComment {
  id: string;
  user: string;
  text: string;
  tag: string;
  weight: 'light' | 'medium' | 'heavy';
  sentiment: Sentiment;
  createdAt: string;
}

const SENTIMENT_GLOW: Record<Sentiment, string> = {
  optimistic: 'from-emerald-500',
  volatile:   'from-rose-500',
  analytical: 'from-blue-500',
  calm:       'from-indigo-500',
};

const TAG_COLOUR: Record<string, string> = {
  '💯': 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  '💀': 'bg-rose-500/10 text-rose-300 border-rose-500/20',
  '🔥': 'bg-orange-500/10 text-orange-300 border-orange-500/20',
  '😲': 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  '🧠': 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  '😅': 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
};

function tagColour(tag: string): string {
  const match = Object.keys(TAG_COLOUR).find((emoji) => tag.includes(emoji));
  return match ? TAG_COLOUR[match] : TAG_COLOUR['💯'];
}

async function fetchAiVibe(headlines: string[]): Promise<string> {
  const prompt = `You are the Apex Sentient News engine. Given these South African news headlines: ${headlines.slice(0, 3).join(' | ')} — write ONE sentence (max 25 words) describing the live cultural resonance and emotional vibe of the SA digital economy right now. Be direct, specific, insightful.`;
  try {
    const res = await fetch('/api/ai-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok || !res.body) return 'Live SA intelligence streams active.';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let result = '';
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          if (parsed.type === 'chunk' && typeof parsed.data === 'string') result += parsed.data;
        } catch { /* skip */ }
      }
    }
    return result.trim().slice(0, 200) || 'Live SA intelligence streams active.';
  } catch {
    return 'Live SA intelligence streams active.';
  }
}

function CommentCard({ comment }: { comment: ResonanceComment }) {
  const time = new Date(comment.createdAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="group relative rounded-[2rem] border border-white/10 backdrop-blur-md cursor-default mb-6 break-inside-avoid"
      style={{ background: comment.weight === 'heavy' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)' } as CSSProperties}
    >
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-700 rounded-[2rem] bg-gradient-to-br ${SENTIMENT_GLOW[comment.sentiment]} to-transparent pointer-events-none`} />
      <div className="relative z-10 p-8">
        <div className="flex justify-between items-start mb-4">
          <span className="text-sm font-medium text-white/60">@{comment.user}</span>
          <span className="text-xs font-mono text-white/25">{time}</span>
        </div>
        <p className={`font-light leading-relaxed mb-6 text-white/90 ${comment.weight === 'heavy' ? 'text-2xl' : 'text-lg'}`}>
          &ldquo;{comment.text}&rdquo;
        </p>
        <div className={`inline-flex px-4 py-1.5 rounded-full text-xs font-mono tracking-widest border ${tagColour(comment.tag)}`}>
          {comment.tag}
        </div>
      </div>
    </motion.div>
  );
}

function SentientNewsPageInner({ isResonanceActive }: { isResonanceActive: boolean }) {
  const [articles, setArticles]             = useState<NewsArticle[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(false);
  const [activeCategory, setActiveCategory] = useState<NewsCategory>('Latest');
  const [failedImages, setFailedImages]     = useState<Set<string>>(new Set());
  const [, startTransition]                 = useTransition();

  const [aiVibe, setAiVibe]                 = useState('Analyzing live cultural resonance...');
  const [comments, setComments]             = useState<ResonanceComment[]>([]);
  const [resonanceReady, setResonanceReady] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const submittedRef = useRef(false);

  const { transition } = useEmotionEngine();
  const { trigger }    = useMultiSensory();
  const { speak }      = useSpeech();

  const handleVoiceSubmit = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return;
    setVoiceProcessing(true);
    transition('processing');
    trigger('processing');
    try {
      const classifyPrompt = `Classify this South African news reaction in JSON only. No markdown, no code fences. Input: "${transcript.slice(0, 300)}" Output must be exactly: {"tag":"<label>","sentiment":"optimistic|volatile|analytical|calm","weight":"light|medium|heavy"} where tag is one of "Valid 💯" or "Roasted 💀" or "Facts 🔥" or "Yoh 😲" or "Relatable 😅" or "Analytical 🧠". Weight is heavy if strong opinion.`;
      const res = await fetch('/api/ai-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: classifyPrompt }] }),
      });
      let tag = 'Valid 💯';
      let sentiment: Sentiment = 'optimistic';
      let weight: 'light' | 'medium' | 'heavy' = 'medium';
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let raw = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const parsed = JSON.parse(trimmed) as Record<string, unknown>;
              if (parsed.type === 'chunk' && typeof parsed.data === 'string') raw += parsed.data;
            } catch { /* skip */ }
          }
        }
        try {
          const clean = raw.replace(/```json|```/g, '').trim();
          const c = JSON.parse(clean) as { tag?: string; sentiment?: string; weight?: string };
          if (c.tag) tag = c.tag;
          if (['optimistic','volatile','analytical','calm'].includes(c.sentiment ?? '')) sentiment = c.sentiment as Sentiment;
          if (['light','medium','heavy'].includes(c.weight ?? '')) weight = c.weight as 'light' | 'medium' | 'heavy';
        } catch { /* use defaults */ }
      }
      const newComment: ResonanceComment = {
        id: `voice-${Date.now()}`,
        user: 'VoiceUser_ZA',
        text: transcript,
        tag,
        weight,
        sentiment,
        createdAt: new Date().toISOString(),
      };
      setComments((prev) => [newComment, ...prev]);
      setAiVibe('New voice note received. Sentiment matrix updated.');
      transition('resolved');
      trigger('processing');
      void speak(`Your note has been classified as ${tag.replace(/[\u{1F300}-\u{1FFFF}]/gu, '').trim()}`);
    } catch {
      setComments((prev) => [{
        id: `voice-${Date.now()}`,
        user: 'VoiceUser_ZA',
        text: transcript,
        tag: 'Valid 💯',
        weight: 'medium',
        sentiment: 'optimistic',
        createdAt: new Date().toISOString(),
      }, ...prev]);
    } finally {
      setVoiceProcessing(false);
      submittedRef.current = false;
      transition('dormant');
    }
  }, [transition, trigger, speak]);

  const voice = useVoiceInput(useCallback((transcript: string) => {
    if (!submittedRef.current && transcript.trim()) {
      submittedRef.current = true;
      void handleVoiceSubmit(transcript);
    }
  }, [handleVoiceSubmit]));

  const fetchNews = useCallback(async (category: NewsCategory) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/news?category=${encodeURIComponent(category)}`);
      const data = await res.json() as { articles?: NewsArticle[] };
      if (!res.ok || !Array.isArray(data.articles)) { setError(true); return; }
      startTransition(() => setArticles(data.articles ?? []));
      if (data.articles && data.articles.length > 0) {
        void fetchAiVibe(data.articles.map((a) => a.title)).then((vibe) => {
          setAiVibe(vibe);
          setResonanceReady(true);
        });
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchNews(activeCategory); }, [activeCategory, fetchNews]);

  const handleVoiceToggle = () => {
    if (voice.isListening) { submittedRef.current = false; voice.stopListening(); }
    else { submittedRef.current = false; transition('awakened'); trigger('awakened'); voice.startListening(); }
  };

  const hero = articles[0];
  const secondary = articles.slice(1);

  return (
    <div
      className="antialiased min-h-screen bg-black text-white relative overflow-x-hidden selection:bg-emerald-500/30 selection:text-emerald-200"
      style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" } as CSSProperties}
    >
      <style>{`
        .hero-zoom{transition:transform 1.5s cubic-bezier(.25,.46,.45,.94)}
        .group:hover .hero-zoom{transform:scale(1.05)}
        .research-reveal{opacity:0;transform:translateY(10px);transition:all 0.5s cubic-bezier(.16,1,.3,1)}
        .group:hover .research-reveal{opacity:1;transform:translateY(0)}
        .masonry{columns:1;column-gap:1.5rem}
        @media(min-width:768px){.masonry{columns:2}}
        @media(min-width:1024px){.masonry{columns:3}}
        .no-scrollbar::-webkit-scrollbar{width:4px}
        .no-scrollbar::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:4px}
        @keyframes spinFast{to{transform:rotate(360deg)}}
        .spin-fast{animation:spinFast .8s linear infinite}
        @keyframes wave{0%,100%{transform:scaleY(.5)}50%{transform:scaleY(1)}}
      `}</style>

      {/* Fixed video background */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <video autoPlay muted loop playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-20 scale-105"
          style={{ mixBlendMode:'screen' } as CSSProperties}>
          <source src="https://cdn.pixabay.com/video/2021/08/11/84688-587270929_large.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-black/90" />
      </div>

      <main className="relative z-10 max-w-[1600px] mx-auto px-6 md:px-12 py-12 min-h-screen">

        {/* Header */}
        <motion.header
          className="flex flex-col md:flex-row justify-between items-end mb-12"
          initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }}
          transition={{ duration:.8, ease:[.16,1,.3,1] }}
        >
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-white/30 hover:text-white transition text-xs tracking-widest uppercase mb-4">
              <ArrowLeft className="w-3 h-3" />Apex
            </Link>
            <div className="flex items-center gap-3 px-5 py-2 rounded-full text-xs tracking-[3px] text-emerald-400 border border-emerald-500/20 mb-4 w-fit"
              style={{ background:'rgba(16,185,129,0.06)' } as CSSProperties}>
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              LIVE SA INTELLIGENCE
            </div>
            <h1 className="text-5xl md:text-7xl font-light tracking-tighter">
              SENTIENT <span className="text-white/30">NEWS</span>
            </h1>
          </div>

          <div className="flex items-center gap-3 mt-6 md:mt-0 flex-wrap justify-end">
            {CATEGORIES.map((cat) => (
              <button key={cat} type="button"
                onClick={() => startTransition(() => setActiveCategory(cat))}
                className={`px-5 py-2 rounded-full text-sm font-light transition-all duration-300 ${
                  activeCategory === cat
                    ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]'
                    : 'border border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                }`}
              >{cat}</button>
            ))}
            <button type="button" onClick={() => void fetchNews(activeCategory)} disabled={loading}
              className="p-2 border border-white/10 rounded-full text-white/30 hover:text-white hover:border-white/30 transition disabled:opacity-40"
              aria-label="Refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </motion.header>

        {/* Loading */}
        <AnimatePresence>
          {loading && (
            <motion.div className="flex flex-col items-center justify-center py-32"
              initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
              <div className="w-16 h-16 border-t-2 border-r-2 border-emerald-400 rounded-full spin-fast mb-6" />
              <p className="text-emerald-300/70 text-sm tracking-[4px] uppercase animate-pulse">
                Intercepting Data Streams
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {!loading && error && (
          <div className="text-center py-24 text-white/30">
            <p className="text-lg mb-4">News feed unavailable</p>
            <p className="text-xs mb-6">Add PERPLEXITY_API_KEY to enable live news.</p>
            <button type="button" onClick={() => void fetchNews(activeCategory)}
              className="px-6 py-2.5 border border-white/10 rounded-full text-sm hover:bg-white/10 transition">Retry</button>
          </div>
        )}

        {/* News grid */}
        <AnimatePresence>
          {!loading && !error && hero && (
            <motion.div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-12"
              initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ duration:.6, delay:.1 }}>

              {/* Hero — 8 cols */}
              <div className="md:col-span-8">
                <a href={hero.url} target="_blank" rel="noopener noreferrer"
                  className="group relative rounded-[2rem] overflow-hidden flex border border-white/10 cursor-pointer hover:border-emerald-500/30 transition-colors duration-500 block"
                  style={{ height:'580px', background:'rgba(255,255,255,0.03)' } as CSSProperties}
                  onClick={() => { transition('awakened'); trigger('awakened'); }}
                >
                  {!hero.imageUrl.startsWith('data:') && !failedImages.has(hero.url) ? (
                    <Image src={hero.imageUrl} alt={hero.title} fill sizes="(max-width:768px) 100vw, 66vw"
                      className="object-cover opacity-60 hero-zoom"
                      onError={() => setFailedImages((p) => new Set(p).add(hero.url))} priority />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={hero.imageUrl} alt={hero.title} className="absolute inset-0 w-full h-full object-cover opacity-60 hero-zoom" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 w-full p-8 md:p-14">
                    <div className="flex items-center gap-4 text-xs font-mono mb-6">
                      <span className="px-3 py-1 rounded-full border border-white/20 text-white/70 tracking-widest uppercase"
                        style={{ background:'rgba(255,255,255,0.08)' } as CSSProperties}>{hero.source}</span>
                      {hero.date && (
                        <span className="text-white/40">
                          {new Date(hero.date).toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'})}
                        </span>
                      )}
                    </div>
                    <h2 className="text-4xl md:text-5xl lg:text-6xl font-light leading-tight mb-6 text-white group-hover:text-emerald-50 transition-colors w-11/12">
                      {hero.title}
                    </h2>
                    <div className="research-reveal flex flex-col md:flex-row md:items-center justify-between gap-6 border-t border-white/10 pt-6">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="mt-2 w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 shadow-[0_0_15px_#34d399]" />
                        <p className="text-lg font-light text-white/80 line-clamp-2">{hero.snippet}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2 px-8 py-4 rounded-full border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500 hover:text-black transition-all"
                        style={{ background:'rgba(16,185,129,0.15)' } as CSSProperties}>
                        <Zap className="w-4 h-4" />
                        <span className="font-mono text-sm tracking-wide">READ FULL</span>
                      </div>
                    </div>
                  </div>
                </a>
              </div>

              {/* Secondary — 4 cols */}
              <div className="md:col-span-4 flex flex-col gap-5 overflow-y-auto no-scrollbar pr-1"
                style={{ maxHeight:'580px' } as CSSProperties}>
                {secondary.map((article, idx) => (
                  <motion.a key={article.url} href={article.url} target="_blank" rel="noopener noreferrer"
                    className="group relative rounded-3xl overflow-hidden border border-white/10 p-6 flex flex-col justify-between hover:border-indigo-500/50 transition-colors cursor-pointer flex-shrink-0 block"
                    style={{ minHeight:'180px', background:'rgba(255,255,255,0.03)' } as CSSProperties}
                    initial={{ opacity:0, x:16 }} animate={{ opacity:1, x:0 }}
                    transition={{ delay:0.05*idx, duration:.5 }}
                    onClick={() => { transition('awakened'); trigger('awakened'); }}
                  >
                    {!article.imageUrl.startsWith('data:') && !failedImages.has(article.url) && (
                      <Image src={article.imageUrl} alt={article.title} fill sizes="33vw"
                        className="object-cover opacity-10 mix-blend-luminosity group-hover:opacity-20 transition-opacity duration-500"
                        onError={() => setFailedImages((p) => new Set(p).add(article.url))} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-br from-black/80 to-transparent pointer-events-none" />
                    <div className="relative z-10">
                      <div className="text-[10px] font-mono tracking-widest text-white/35 mb-2 uppercase">
                        {article.source}{article.date ? ` · ${new Date(article.date).toLocaleDateString('en-ZA',{day:'numeric',month:'short'})}` : ''}
                      </div>
                      <h3 className="text-xl font-light leading-snug text-white/90 group-hover:text-white transition-colors">{article.title}</h3>
                    </div>
                    <div className="relative z-10 flex items-center justify-between mt-5">
                      <span className="text-xs font-mono text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity tracking-widest">READ →</span>
                      <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-indigo-500 group-hover:border-indigo-500 transition-colors"
                        style={{ background:'rgba(255,255,255,0.04)' } as CSSProperties}>
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                    </div>
                  </motion.a>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── LIVE RESONANCE MATRIX ─────────────────────────────────────────── */}
        <AnimatePresence>
          {resonanceReady && (
            <motion.section className="w-full max-w-[1200px] mx-auto mt-24 py-12"
              initial={{ opacity:0, y:32 }} animate={{ opacity:1, y:0 }}
              transition={{ duration:.8, ease:[.16,1,.3,1] }}>

              {/* Vibe header */}
              <div className="mb-12 p-6 rounded-[2rem] border border-white/10 backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
                style={{ background:'rgba(255,255,255,0.04)' } as CSSProperties}>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-2 h-2 rounded-full bg-fuchsia-500 animate-ping" />
                    <span className="text-xs font-mono text-fuchsia-300 tracking-[0.2em] uppercase">Live Cultural Resonance</span>
                  </div>
                  <p className="text-xl md:text-2xl font-light text-white/90 leading-relaxed">{aiVibe}</p>
                </div>

                {voice.isSupported && (
                  <button type="button" onClick={handleVoiceToggle} disabled={voiceProcessing}
                    className={`shrink-0 relative rounded-full px-8 py-4 border transition-all duration-500 flex items-center gap-3 ${
                      voice.isListening ? 'border-fuchsia-500 text-fuchsia-300'
                        : voiceProcessing ? 'border-white/20 text-white/40 cursor-not-allowed'
                        : 'border-white/20 text-white hover:border-white hover:bg-white/10'
                    }`}
                    style={{ background: voice.isListening ? 'rgba(217,70,239,0.15)' : 'rgba(255,255,255,0.05)' } as CSSProperties}
                  >
                    {voice.isListening ? (
                      <div className="flex items-center gap-0.5 h-5">
                        {[8,15,20,12,8].map((h, i) => (
                          <div key={i} className="w-0.5 bg-fuchsia-400 rounded-full"
                            style={{ height:`${h}px`, animation:`wave .5s ease-in-out infinite`, animationDelay:`${i*0.1}s` } as CSSProperties} />
                        ))}
                      </div>
                    ) : voiceProcessing ? (
                      <div className="w-4 h-4 border-t border-fuchsia-400 rounded-full spin-fast" />
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    )}
                    <span className="font-mono text-sm tracking-widest uppercase">
                      {voice.isListening ? 'Recording…' : voiceProcessing ? 'Analysing…' : 'Drop Voice Note'}
                    </span>
                  </button>
                )}
              </div>

              {/* Live transcript */}
              <AnimatePresence>
                {voice.isListening && (voice.interimText || voice.finalText) && (
                  <motion.div className="mb-8 p-6 rounded-[2rem] border border-fuchsia-500/30 text-fuchsia-100 font-light text-lg italic"
                    style={{ background:'rgba(217,70,239,0.08)' } as CSSProperties}
                    initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}>
                    {voice.interimText || voice.finalText}<span className="animate-pulse">…</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Comment masonry */}
              {comments.length === 0 ? (
                <div className="text-center py-16 text-white/20 text-sm tracking-widest">
                  Drop a voice note to activate the resonance matrix.
                </div>
              ) : (
                <div className="masonry">
                  <AnimatePresence>
                    {comments.map((c) => <CommentCard key={c.id} comment={c} />)}
                  </AnimatePresence>
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}

export default function SentientNewsPage() {
  // Resonance matrix visibility is gated by resonanceReady state inside the inner
  // component. The Vercel flag can be re-introduced via a proper server component
  // wrapper once the file is split. Defaults to true so real AI data drives display.
  return (
    <EmotionProvider>
      <SentientNewsPageInner isResonanceActive={true} />
    </EmotionProvider>
  );
}
