/**
 * Root Layout Component
 *
 * Provides the HTML structure, metadata, and global providers for the application.
 * Includes schema.org JSON-LD for SEO optimization and Vercel Speed Insights.
 *
 * @module app/layout
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

/**
 * Geist Sans font configuration for primary typography.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/**
 * Geist Mono font configuration for code and monospace text.
 */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Page metadata for SEO optimization.
 *
 * Includes OpenGraph and Twitter card metadata for social sharing,
 * plus keywords for search engine discovery.
 */
export const metadata: Metadata = {
  title: "Apex - Sentient Interface",
  description:
    "Apex helps South African creators build sustainable digital income through AI agents, real-time GitHub metrics, and OpenTelemetry observability.",
  keywords: ["Apex", "Sentient Interface", "AI", "Next.js", "Grafana", "OpenTelemetry", "digital income", "South Africa"],
  authors: [{ name: "Apex Team" }],
  openGraph: {
    title: "Apex - Sentient Interface",
    description:
      "Apex helps South African creators build sustainable digital income through AI agents and community opportunities.",
    type: "website",
    url: "https://apex-coral-zeta.vercel.app",
  },
};

/**
 * Schema.org JSON-LD structured data for SEO.
 *
 * Placed in the server component layout so it is present in the initial
 * HTML response and visible to Google, Bing, and AI crawlers.
 * Do NOT move this into page.tsx which is a 'use client' component.
 */
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Apex Sentient Interface",
  description:
    "Intelligent Engine for South African digital income opportunities. Provides AI-powered answers, live opportunity scouting, and real-time GitHub metrics.",
  url: "https://apex-coral-zeta.vercel.app",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "en-ZA",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "ZAR",
    availability: "https://schema.org/InStock",
  },
  provider: {
    "@type": "Organization",
    name: "Apex",
    url: "https://apex-coral-zeta.vercel.app",
  },
};

/**
 * Root layout component that wraps all pages.
 *
 * Provides:
 * - HTML structure with language attribute
 * - Font CSS variable classes
 * - Schema.org JSON-LD for SEO
 * - Vercel Speed Insights for performance monitoring
 * - Global Toaster for notifications
 *
 * @param props - Component props
 * @param props.children - Child page components to render
 * @returns The root layout React component
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* GEO: schema.org markup rendered server-side for crawler visibility */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Toaster />
        <SpeedInsights />
      </body>
    </html>
  );
}
