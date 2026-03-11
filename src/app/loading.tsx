/**
 * Loading Skeleton — Instant first paint (FCP fix)
 *
 * Next.js App Router streams this component to the browser IMMEDIATELY while
 * the real page.tsx renders server-side. This is the critical fix for the
 * 14.89s FCP measured in Speed Insights (SA-2026-03-11, 3 data points).
 *
 * HOW IT WORKS:
 * When a route segment has a loading.tsx, Next.js wraps the page in a
 * <Suspense> boundary automatically. The loading UI is sent in the FIRST
 * HTTP chunk (sub-100ms TTFB). The real page replaces it once rendered.
 *
 * DESIGN CONTRACT:
 * - Zero JavaScript — pure HTML + CSS only (this file has no 'use client')
 * - Matches the real page visual structure to prevent CLS on swap
 * - Dark background (#0a0a0a) matches globals.css body background
 * - Hero card skeleton: max-w-5xl, mt-16, min-height 300px (verified dev tools)
 * - Animate-pulse shimmer is a Tailwind built-in (already in CSS bundle)
 *
 * @module app/loading
 */
export default function Loading() {
  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-white"
      aria-busy="true"
      aria-label="Loading Apex Central"
    >
      {/* Nav skeleton — matches real nav height */}
      <div className="fixed top-0 left-0 right-0 z-40 h-16 border-b border-white/5 bg-black/20 backdrop-blur-md px-6 flex items-center gap-4">
        <div className="w-24 h-4 rounded-full bg-white/10 animate-pulse" />
        <div className="flex-1" />
        <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
        <div className="w-16 h-8 rounded-full bg-white/10 animate-pulse" />
        <div className="w-20 h-8 rounded-full bg-white/10 animate-pulse" />
      </div>

      {/* Background gradient — matches real page */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-neutral-950 via-neutral-900/80 to-neutral-950" aria-hidden="true" />

      <main className="relative pt-16 px-4 sm:px-6 pb-24">
        {/* Hero card skeleton — max-w-5xl, mt-16, min-height 300px */}
        <div className="mx-auto max-w-5xl mt-16 rounded-3xl p-16 min-h-[300px] border border-white/10 bg-white/[0.03] relative overflow-hidden">
          {/* Shimmer overlay */}
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" aria-hidden="true" />

          {/* Title skeleton: "Sentient Interface" h1 */}
          <div className="w-48 h-6 rounded-full bg-white/10 animate-pulse mb-6" />
          <div className="w-80 h-12 rounded-2xl bg-white/15 animate-pulse mb-4" />
          <div className="w-64 h-8 rounded-xl bg-white/10 animate-pulse mb-6" />
          <div className="w-96 h-5 rounded-full bg-white/8 animate-pulse mb-2" />
          <div className="w-80 h-5 rounded-full bg-white/6 animate-pulse mb-8" />

          {/* GitHub metrics strip skeleton — 4 badges */}
          <div className="flex items-center gap-3 flex-wrap">
            {[72, 56, 64, 88, 96].map((w) => (
              <div key={w} className="h-8 rounded-full bg-white/10 animate-pulse" style={{ width: `${w}px` }} />
            ))}
          </div>
        </div>

        {/* Department nav skeleton */}
        <div className="mx-auto max-w-5xl mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/5 border border-white/8 animate-pulse" />
          ))}
        </div>

        {/* Opportunities section skeleton */}
        <div className="mx-auto max-w-5xl mt-12">
          <div className="w-48 h-6 rounded-full bg-white/10 animate-pulse mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-40 rounded-3xl bg-white/5 border border-white/8 animate-pulse" />
            ))}
          </div>
        </div>

        {/* News section skeleton */}
        <div className="mx-auto max-w-5xl mt-12">
          <div className="w-32 h-6 rounded-full bg-white/10 animate-pulse mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="h-80 rounded-3xl bg-white/5 border border-white/8 animate-pulse col-span-1 md:col-span-2" />
            <div className="h-80 rounded-3xl bg-white/5 border border-white/8 animate-pulse" />
          </div>
        </div>
      </main>
    </div>
  );
}
