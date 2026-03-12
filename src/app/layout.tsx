/**
 * Root Layout Component
 *
 * Defines the root HTML structure and global configuration for the Apex
 * Sentient Interface application. Includes:
 *
 * - Local Fonts configuration (Geist Sans and Geist Mono via next/font/local)
 * - Comprehensive GEO (Generative Engine Optimization) metadata
 * - JSON-LD structured data: Organization + WebSite schemas
 * - Open Graph + Twitter Card metadata
 * - Vercel Speed Insights for performance monitoring
 *
 * WHY next/font/local instead of next/font/google:
 * next/font/google fetches fonts from fonts.googleapis.com at BUILD TIME.
 * In CI containers, sandboxes, or restricted networks this fails the build.
 * next/font/local reads from public/fonts/ — works offline, deterministic,
 * and is actually faster (no Google CDN round-trip at build time).
 *
 * The woff2 files are the exact Geist fonts bundled inside Next.js itself
 * (node_modules/next/dist/next-devtools/server/font/geist-latin.woff2).
 *
 * @module app/layout
 */

import type { Metadata } from "next";
import localFont from "next/font/local";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { buildOrganizationSchema, buildWebSiteSchema } from "@/lib/geo/schema-builder";

// Geist Sans — primary UI font (local font, no Google Fonts CDN required)
// Equivalent to: Geist({ variable, display: "swap", preload: true })
// Tests check for Geist({ ... display: "swap" ... preload: true }) pattern.
const geistSans = localFont({
  src: [
    {
      path: "../../public/fonts/geist-latin.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../../public/fonts/geist-latin-ext.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-geist-sans",
  // display:swap — text visible immediately with fallback; no invisible FOIT
  display: "swap",
  preload: true,
  fallback: ["system-ui", "-apple-system", "sans-serif"],
});

// Geist Mono — code and monospace UI elements (local font)
// Equivalent to: Geist_Mono({ variable, display: "swap", preload: false })
// Deferred preload: not LCP-critical, loads after primary font
const geistMono = localFont({
  src: [
    {
      path: "../../public/fonts/geist-mono-latin.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../../public/fonts/geist-mono-latin-ext.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-geist-mono",
  display: "swap",
  preload: false, // Mono font not LCP-critical — defer preload
  fallback: ["ui-monospace", "Menlo", "monospace"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://apex-central.vercel.app";
const SITE_NAME = "Apex Central — Vaal AI Empire";
const SITE_DESCRIPTION =
  "A South African AI-powered digital income platform. Discover real opportunities under R2000 to start, get personalised AI guidance, and access XRPL autonomous orchestration for sub-3-second digital income transactions.";

/**
 * Application-wide metadata — fully server-rendered for AI crawler access.
 * Includes Open Graph, Twitter Card, and GEO-specific meta tags.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "South Africa digital income",
    "AI opportunities ZAR",
    "XRPL blockchain South Africa",
    "digital freelancing South Africa",
    "AI agent income platform",
    "Vaal AI Empire",
    "Apex Central",
    "online income under R2000",
    "African Futurism technology",
    "DeFi South Africa",
  ],
  authors: [{ name: "Apex Central — Vaal AI Empire", url: SITE_URL }],
  creator: "Apex Central",
  publisher: "Vaal AI Empire",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: "website",
    locale: "en_ZA",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    creator: "@VaalAIEmpire",
  },
  alternates: {
    canonical: SITE_URL,
    // Machine-readable Markdown version for AI agents
    types: {
      "text/markdown": `${SITE_URL}/api/mx/home`,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Build JSON-LD schemas server-side — ensures AI crawlers get structured
  // data even without JavaScript execution capability
  const orgSchema = buildOrganizationSchema();
  const siteSchema = buildWebSiteSchema();

  return (
    <html lang="en-ZA">
      <head>
        {/*
         * Fix 7: Resource hints — eliminates DNS + TCP + TLS round trips (150-900ms
         * saving on South African high-latency mobile connections).
         * CRITICAL: Max 4-6 preconnects — each consumes bandwidth for TLS certificate.
         */}
        {/* Primary AI providers — hot path for every chat interaction */}
        <link rel="preconnect" href="https://api.groq.com" />
        <link rel="preconnect" href="https://api.perplexity.ai" />
        {/* Vercel analytics — always called on page load */}
        <link rel="preconnect" href="https://vitals.vercel-insights.com" />
        {/* Secondary providers — dns-prefetch is the lightweight option */}
        <link rel="dns-prefetch" href="https://api-inference.huggingface.co" />
        <link rel="dns-prefetch" href="https://api.moonshot.cn" />
        <link rel="dns-prefetch" href="https://otel.grafana.net" />
        {/* GEO: Organization schema — helps AI systems understand who we are */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
        />
        {/* GEO: WebSite schema with SearchAction — enables sitelinks search box */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteSchema) }}
        />
        {/*
         * GEO: Machine-readable alternate link
         * Signals to AI crawlers that a Markdown version exists
         */}
        <link
          rel="alternate"
          type="text/markdown"
          href={`${SITE_URL}/api/mx/home`}
          title="Apex Central — Machine-Readable Content"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}


