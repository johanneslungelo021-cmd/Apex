/**
 * Global Error Boundary — Apex Platform
 *
 * CRITICAL MISSING FILE (SA-2026-03-12 audit):
 * Without error.tsx, ANY unhandled React render error in page.tsx or its children
 * propagates to the root layout and produces the generic Next.js white screen with
 * "Application Error: a client-side exception has occurred" — the exact symptom
 * described in the speed insights audit.
 *
 * With this file, Next.js wraps the page segment in a React ErrorBoundary.
 * Render errors are caught here and displayed as a recoverable UI instead of
 * an opaque white screen. The user can retry without a full page reload.
 *
 * This component MUST be a Client Component ('use client') — React ErrorBoundary
 * requires class-based or hook-based error handling, which only works client-side.
 *
 * Design contract:
 *   - Dark background (#0a0a0a) — consistent with globals.css body
 *   - Branded Apex error message with retry button
 *   - Logs error digest to console for Vercel Function Logs correlation
 *   - Accessible: role="alert", aria-live="assertive"
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/error
 * @module app/error
 */
"use client";

import { useEffect } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to Vercel Function Logs — correlate with digest in dashboard
    console.error("[Apex] Render error caught by error.tsx boundary:", {
      message: error.message,
      digest: error.digest,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }, [error]);

  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6"
      role="alert"
      aria-live="assertive"
    >
      {/* Background gradient — matches real page */}
      <div
        className="fixed inset-0 -z-10 bg-gradient-to-b from-neutral-950 via-neutral-900/80 to-neutral-950"
        aria-hidden="true"
      />

      {/* Error card */}
      <div className="glass max-w-md w-full rounded-3xl p-10 text-center border border-red-500/20">
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-white mb-2">
          Something went wrong
        </h1>
        <p className="text-white/50 text-sm mb-8 leading-relaxed">
          The Apex interface encountered an unexpected error. Your data is safe
          — this is a display issue only.
        </p>

        {/* Error digest for support reference */}
        {error.digest && (
          <p className="text-white/25 text-xs font-mono mb-6">
            Error ID: {error.digest}
          </p>
        )}

        {/* Retry button */}
        <button
          onClick={reset}
          className="w-full py-3 px-6 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 hover:border-white/20 text-white text-sm font-medium transition-all duration-200 cursor-pointer"
        >
          Try again
        </button>

        {/* Reload fallback */}
        <button
          onClick={() => window.location.reload()}
          className="w-full mt-3 py-3 px-6 rounded-2xl text-white/40 hover:text-white/60 text-sm transition-colors duration-200 cursor-pointer"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
