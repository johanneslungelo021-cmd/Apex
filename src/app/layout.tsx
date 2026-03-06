/**
 * Root Layout Component
 *
 * Defines the root HTML structure and global configuration for the Apex
 * Sentient Interface application. This layout wraps all pages and provides:
 *
 * - Google Fonts configuration (Geist Sans and Geist Mono)
 * - Global metadata for SEO and social sharing
 * - Vercel Speed Insights for performance monitoring
 * - Antialiasing and base typography styles
 *
 * @module app/layout
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/layout
 */

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

/**
 * Geist Sans font configuration with CSS variable for Tailwind integration.
 * Provides the primary typeface for the application.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

/**
 * Geist Mono font configuration for code and monospace content.
 * Used for metrics displays and technical text.
 */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Application metadata for SEO and social sharing.
 *
 * Includes Open Graph configuration for rich link previews on social platforms
 * and search engine optimization settings.
 */
export const metadata: Metadata = {
  title: "Apex - Sentient Interface",
  description: "Phase 1 Complete - Full functional landing page with AI-powered features, real-time GitHub metrics, and OpenTelemetry integration.",
  keywords: ["Apex", "Sentient Interface", "AI", "Next.js", "Grafana", "OpenTelemetry"],
  authors: [{ name: "Apex Team" }],
  openGraph: {
    title: "Apex - Sentient Interface",
    description: "Phase 1 Complete - Full functional landing page with AI-powered features",
    type: "website",
  },
};

/**
 * Root layout component that wraps all pages in the application.
 *
 * Sets up the HTML document structure with proper lang attribute,
 * font CSS variables, and includes Vercel Speed Insights for
 * performance monitoring.
 *
 * @param props - Component props
 * @param props.children - Child page components to render
 * @returns The root HTML layout structure
 *
 * @example
 * // This layout automatically wraps all pages
 * // Pages are rendered as {children}
 *
 * // For a page at /about:
 * <RootLayout>
 *   <AboutPage />
 * </RootLayout>
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
