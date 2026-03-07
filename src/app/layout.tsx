/**
 * Root Layout Component — Phase 3
 *
 * Sets up the HTML document structure with:
 * - Google Fonts (Geist Sans + Geist Mono)
 * - Full SEO metadata with Open Graph and Twitter cards
 * - PWA manifest link, theme-color, and apple-touch-icon
 * - Vercel Speed Insights
 * - Service worker registration script
 *
 * @module app/layout
 */

import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Apex — Sentient Interface',
  description:
    'Live digital income opportunities for South African creators. AI-powered Scout Agent finds real options under R2000. Categorised live news from Tech, Finance, Startups.',
  keywords: [
    'Apex',
    'digital income South Africa',
    'Sentient Interface',
    'Scout Agent',
    'AI opportunities',
    'South Africa freelancing',
    'ZAR income',
    'Grafana OpenTelemetry',
  ],
  authors: [{ name: 'Apex Team' }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Apex',
  },
  openGraph: {
    title: 'Apex — Sentient Interface',
    description:
      'AI-powered Scout Agent finds real digital income opportunities under R2000 for South African creators.',
    type: 'website',
    locale: 'en_ZA',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Apex — Sentient Interface',
    description: 'Live SA digital income opportunities powered by Scout Agent + Intelligent Engine.',
  },
};

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZA">
      <head>
        <link rel="apple-touch-icon" sizes="192x192" href="/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <SpeedInsights />

        {/* Service worker registration — runs only in the browser */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .catch(function() {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
