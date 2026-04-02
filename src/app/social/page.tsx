"use client";

import { useState, useEffect, useRef } from "react";
import { EmotionProvider, useEmotionEngine } from "@/hooks/useEmotionEngine";
import { useSpeech } from "@/hooks/useSpeech";
import type { SocialPackage, SocialPost } from "@/app/api/social/route";

// ── Niche seeds that map directly to what /api/social understands ────────────
const SA_NICHES = [
  { id: "kota", title: "Township Food & Kotas", icon: "🍔" },
  { id: "amapiano", title: "Amapiano Producer & Artist", icon: "🎹" },
  { id: "crypto", title: "SA Crypto & XRPL Trader", icon: "⚡" },
  { id: "tutor", title: "Matric Online Tutoring", icon: "📚" },
  { id: "design", title: "Freelance Graphic Designer", icon: "🎨" },
  { id: "ecom", title: "Takealot Reseller & eCommerce", icon: "📦" },
];

const PLATFORM_COLORS: Record<string, string> = {
  "Twitter/X": "text-sky-400 border-sky-500/30 bg-sky-500/10",
  LinkedIn: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  Facebook: "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
  Instagram: "text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/10",
  TikTok: "text-pink-400 border-pink-500/30 bg-pink-500/10",
};

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Post card ────────────────────────────────────────────────────────────────
function PostCard({ post }: { post: SocialPost }) {
  const [copied, setCopied] = useState(false);
  const colorCls =
    PLATFORM_COLORS[post.platform] ??
    "text-zinc-400 border-zinc-500/30 bg-zinc-500/10";

  const copyCaption = async () => {
    const text = `${post.caption}\n\n${post.hashtags.map((h) => `#${h}`).join(" ")}\n\n${post.callToAction}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass rounded-2xl p-6 border border-white/10 flex flex-col gap-4 hover:border-white/20 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full border ${colorCls}`}
        >
          {post.platform}
        </span>
        <span className="text-xs font-mono text-white/30">
          {post.bestPostTime}
        </span>
      </div>

      {/* Caption */}
      <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
        {post.caption}
      </p>

      {/* Hashtags */}
      <div className="flex flex-wrap gap-1.5">
        {post.hashtags.map((tag) => (
          <span
            key={tag}
            className="text-xs text-white/40 glass px-2 py-0.5 rounded-lg"
          >
            #{tag}
          </span>
        ))}
      </div>

      {/* CTA + tip */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-white/60">
          CTA:{" "}
          <span className="font-normal text-white/50">{post.callToAction}</span>
        </p>
        <p className="text-xs text-white/30">💡 {post.engagementTip}</p>
      </div>

      {/* Copy */}
      <button
        onClick={() => void copyCaption()}
        className="mt-auto w-full py-2.5 rounded-xl border border-white/10 text-xs font-mono tracking-widest text-white/40 hover:text-white hover:border-fuchsia-500/50 hover:bg-fuchsia-500/10 transition-all"
      >
        {copied ? "✓ COPIED" : "COPY CAPTION + HASHTAGS"}
      </button>
    </div>
  );
}

// ── Weekly calendar ──────────────────────────────────────────────────────────
function WeeklyCalendar({
  calendar,
}: {
  calendar: SocialPackage["weeklyCalendar"];
}) {
  return (
    <div className="glass rounded-2xl p-6 border border-white/10">
      <h3 className="text-xs font-mono tracking-widest text-white/40 uppercase mb-4">
        Weekly Posting Calendar
      </h3>
      <div className="grid grid-cols-7 gap-2">
        {calendar.map((entry, i) => (
          <div key={i} className="flex flex-col gap-1 text-center">
            <span className="text-[10px] font-mono text-white/30">
              {DAY_SHORT[i] ?? entry.day}
            </span>
            <div className="glass rounded-xl p-2 border border-white/10 min-h-[64px] flex flex-col justify-center gap-1">
              <span className="text-[10px] text-white/60 leading-snug">
                {entry.theme}
              </span>
              <span className="text-[9px] text-white/30">{entry.platform}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Inner (needs EmotionProvider in scope) ───────────────────────────────────
function SentientSocialRoomInner() {
  const [selectedNiche, setSelectedNiche] = useState<string | null>(null);
  const [customNiche, setCustomNiche] = useState("");
  const [socialPkg, setSocialPkg] = useState<SocialPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emotion = useEmotionEngine();
  const { speak } = useSpeech();
  const hasSpokeRef = useRef(false);

  useEffect(() => {
    emotion.transition("awakened");
    const t = setTimeout(() => {
      if (!hasSpokeRef.current) {
        hasSpokeRef.current = true;
        void speak(
          "Welcome to the Creative Resonance Chamber. Select a trending niche to generate your live content package.",
        );
      }
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateForNiche = async (niche: string) => {
    if (!niche.trim() || loading) return;
    setSelectedNiche(niche);
    setSocialPkg(null);
    setError(null);
    setLoading(true);
    emotion.transition("processing");
    void speak(`Synthesising live content package for ${niche}. Stand by.`);

    try {
      const res = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: niche.trim() }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data?.message ?? `API error ${res.status}`);
      }

      const pkg = (await res.json()) as SocialPackage;
      setSocialPkg(pkg);
      emotion.transition("resolved");
      void speak(
        `Content package ready for ${niche}. ${pkg.posts.length} posts generated across all platforms.`,
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Content generation failed. Check your API key.";
      setError(msg);
      emotion.transition("processing");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSelectedNiche(null);
    setSocialPkg(null);
    setError(null);
    setCustomNiche("");
    emotion.transition("awakened");
  };

  return (
    <main className="relative min-h-screen bg-black text-white overflow-x-hidden font-sans">
      {/* Ambient gradient — no external video dependency */}
      <div
        className={`absolute inset-0 z-0 transition-all duration-1000 ${
          loading
            ? "bg-indigo-950/80"
            : socialPkg
              ? "bg-gradient-to-br from-fuchsia-950/40 via-black to-black"
              : "bg-black"
        }`}
      />
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 20% 30%, rgba(168,85,247,0.07) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 md:px-12 py-12 flex flex-col min-h-screen">
        {/* Header */}
        <header className="mb-12">
          <div className="inline-flex items-center gap-3 px-5 py-2 glass rounded-full text-xs tracking-[3px] mb-4 border border-white/10">
            <div
              className={`w-2 h-2 rounded-full ${
                loading
                  ? "bg-indigo-400 animate-ping"
                  : socialPkg
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-fuchsia-400 animate-pulse"
              }`}
            />
            ALGORITHMIC RESONANCE
          </div>
          <h1 className="text-5xl md:text-7xl font-light tracking-tighter">
            {loading
              ? "SYNTHESISING…"
              : socialPkg
                ? selectedNiche?.toUpperCase()
                : "SELECT YOUR NICHE"}
          </h1>
          {socialPkg && (
            <p className="text-white/40 mt-2 font-mono text-sm">
              {socialPkg.posts.length} posts · {socialPkg.weeklyCalendar.length}
              -day calendar · Live from Groq
            </p>
          )}
        </header>

        {/* ── STATE 1: NICHE SELECTION ───────────────────────── */}
        {!selectedNiche && !loading && (
          <div className="flex-1 flex flex-col justify-center">
            <p className="text-xl font-light text-white/50 mb-8 max-w-2xl">
              AI maps current SA social engagement patterns and generates a
              ready-to-post content package for your niche.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
              {SA_NICHES.map((niche) => (
                <button
                  key={niche.id}
                  onClick={() => void generateForNiche(niche.title)}
                  className="group relative text-left p-8 rounded-[2rem] glass border border-white/10 overflow-hidden hover:bg-white/8 hover:border-fuchsia-500/40 transition-all duration-400 hover:-translate-y-1.5"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="text-4xl mb-4 block">{niche.icon}</span>
                  <h3 className="text-lg font-medium">{niche.title}</h3>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4 max-w-xl mb-6">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-xs font-mono tracking-widest text-white/30">
                OR ENTER CUSTOM
              </span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <div className="max-w-xl relative group">
              <input
                type="text"
                value={customNiche}
                onChange={(e) => setCustomNiche(e.target.value)}
                placeholder="e.g. Mobile Car Wash in Johannesburg…"
                className="w-full bg-transparent border-b border-white/20 px-4 py-4 text-xl font-light text-white placeholder-white/25 focus:outline-none focus:border-fuchsia-400 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void generateForNiche(customNiche);
                }}
              />
              <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs font-mono text-fuchsia-400 opacity-0 group-focus-within:opacity-100 transition-opacity">
                PRESS ENTER
              </span>
            </div>
          </div>
        )}

        {/* ── STATE 2: LOADING ──────────────────────────────── */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto border-t-2 border-r-2 border-fuchsia-400 rounded-full animate-spin mb-8" />
              <h2 className="text-2xl font-light tracking-widest text-fuchsia-200 animate-pulse">
                GENERATING CONTENT PACKAGE
              </h2>
              <p className="text-white/30 font-mono text-xs mt-3">
                Calling Groq · llama-3.1-8b-instant · SA context injection
              </p>
            </div>
          </div>
        )}

        {/* ── STATE 3: ERROR ────────────────────────────────── */}
        {error && !loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="glass rounded-2xl p-10 border border-red-500/20 text-center max-w-md">
              <p className="text-red-400 font-mono text-sm mb-6">{error}</p>
              <button
                onClick={reset}
                className="text-xs font-mono text-white/40 hover:text-white transition"
              >
                ← Try another niche
              </button>
            </div>
          </div>
        )}

        {/* ── STATE 4: RESULTS ──────────────────────────────── */}
        {socialPkg && !loading && (
          <div className="flex-1 space-y-10">
            {/* Posts grid */}
            <div>
              <h2 className="text-xs font-mono tracking-widest text-white/30 uppercase mb-5">
                Ready-to-Post Content — {socialPkg.posts.length} Posts
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                {socialPkg.posts.map((post, i) => (
                  <PostCard key={i} post={post} />
                ))}
              </div>
            </div>

            {/* Weekly calendar */}
            {socialPkg.weeklyCalendar.length > 0 && (
              <WeeklyCalendar calendar={socialPkg.weeklyCalendar} />
            )}

            {/* Reset */}
            <div className="text-center pt-4">
              <button
                onClick={reset}
                className="text-xs font-mono text-white/30 hover:text-white transition"
              >
                ← GENERATE FOR A DIFFERENT NICHE
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function SentientSocialRoom() {
  return (
    <EmotionProvider>
      <SentientSocialRoomInner />
    </EmotionProvider>
  );
}
