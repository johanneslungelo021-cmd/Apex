/**
 * Root Layout Component
 *
 * Defines the root HTML structure and global configuration for the Apex
 * Sentient Interface application. Includes:
 *
 * - Google Fonts configuration (Geist Sans and Geist Mono)
 * - Comprehensive GEO (Generative Engine Optimization) metadata
 * - JSON-LD structured data: Organization + WebSite schemas
 * - Open Graph + Twitter Card metadata
 * - Vercel Speed Insights for performance monitoring
 *
 * @module app/layout
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { buildOrganizationSchema, buildWebSiteSchema } from "@/lib/geo/schema-builder";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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


