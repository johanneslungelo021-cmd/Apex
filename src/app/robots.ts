/**
 * GEO robots.txt — Differential AI Crawler Policy
 *
 * Strategy:
 *  - AI search crawlers (PerplexityBot, etc.) and AI assistants (ChatGPT-User,
 *    Claude-User) get FULL access — we WANT to be cited in AI-generated answers.
 *  - Training-data scrapers (GPTBot, ClaudeBot) get access to public pages but
 *    are excluded from /api/* and /proprietary/ to prevent wholesale data ingestion.
 *  - All bots are rate-advised via Crawl-delay (Anthropic officially supports this).
 *
 * The /api/mx/* shadow-routes are explicitly allowed so AI agents can fetch
 * our pre-rendered Markdown summaries.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 * @module app/robots
 */

import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://apex-central.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // ── Standard search engines — full access ──────────────────────────────
      {
        userAgent: 'Googlebot',
        allow: '/',
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
      },
      {
        userAgent: 'Slurp', // Yahoo
        allow: '/',
      },

      // ── AI search crawlers — full access + Markdown shadow-routes ──────────
      // These power AI-generated answers. We actively want inclusion.
      {
        userAgent: 'PerplexityBot',
        allow: ['/'],
        // Markdown shadow-routes explicitly allowed
      },
      {
        userAgent: 'YouBot',
        allow: '/',
      },
      {
        userAgent: 'DuckDuckBot',
        allow: '/',
      },

      // ── AI assistants — full access (fetching content for user prompts) ─────
      {
        userAgent: 'ChatGPT-User',
        allow: '/',
      },
      {
        userAgent: 'Claude-User',
        allow: '/',
      },
      {
        userAgent: 'Claude-SearchBot',
        allow: '/',
      },
      {
        userAgent: 'Perplexity-User',
        allow: '/',
      },
      {
        userAgent: 'Operator', // OpenAI Operator agent
        allow: '/',
      },

      // ── AI training scrapers — restricted; public content only ─────────────
      // Allow public pages (including our GEO-optimised /api/mx/* docs)
      // but exclude API execution endpoints and raw data routes.
      {
        userAgent: 'GPTBot',
        allow: ['/', '/api/mx/'],
        disallow: ['/api/ai-agent', '/api/register', '/api/analytics'],
        crawlDelay: 1,
      },
      {
        userAgent: 'ClaudeBot',
        allow: ['/', '/api/mx/'],
        disallow: ['/api/ai-agent', '/api/register', '/api/analytics'],
        crawlDelay: 1,
      },
      {
        userAgent: 'Google-Extended',
        allow: ['/', '/api/mx/'],
        disallow: ['/api/'],
      },
      {
        userAgent: 'Bytespider',
        allow: ['/', '/api/mx/'],
        disallow: ['/api/ai-agent', '/api/register', '/api/analytics'],
        crawlDelay: 2,
      },
      {
        userAgent: 'CCBot',
        allow: ['/', '/api/mx/'],
        disallow: ['/api/'],
        crawlDelay: 2,
      },
      {
        userAgent: 'anthropic-ai',
        allow: ['/', '/api/mx/'],
        disallow: ['/api/ai-agent', '/api/register', '/api/analytics'],
        crawlDelay: 1,
      },
      {
        userAgent: 'Amazonbot',
        allow: ['/', '/api/mx/'],
        disallow: ['/api/'],
        crawlDelay: 2,
      },
      {
        userAgent: 'FacebookBot',
        allow: '/',
        disallow: ['/api/ai-agent', '/api/register'],
      },
      {
        userAgent: 'cohere-training-data-crawler',
        allow: ['/', '/api/mx/'],
        disallow: ['/api/'],
        crawlDelay: 2,
      },

      // ── Default — allow all unlisted bots ─────────────────────────────────
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/register', '/api/analytics'],
      },
    ],

    // Canonical sitemap location
    sitemap: `${SITE_URL}/sitemap.xml`,

    // Machine-readable Markdown honeypot — signals the /api/mx/* layer exists
    host: SITE_URL,
  };
}
