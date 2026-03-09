/**
 * GEO Sitemap — XML Sitemap + Markdown Alternate URLs
 *
 * Provides search engines and AI crawlers with the full URL inventory.
 * Each entry includes:
 *   - canonical HTML URL (for browsers)
 *   - lastModified for freshness signals
 *   - changeFrequency and priority hints
 *
 * The /api/mx/* Markdown shadow-routes are included as distinct entries
 * so AI crawlers explicitly discover our pre-rendered content.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 * @module app/sitemap
 */

import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://apex-central.vercel.app';
const NOW = new Date().toISOString();

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // ── Core pages ───────────────────────────────────────────────────────────
    {
      url: SITE_URL,
      lastModified: NOW,
      changeFrequency: 'hourly', // News + opportunities refresh constantly
      priority: 1.0,
    },

    // ── Machine-readable Markdown shadow-routes ───────────────────────────────
    // Explicitly declared so AI crawlers discover the pre-rendered content.
    {
      url: `${SITE_URL}/api/mx/home`,
      lastModified: NOW,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/api/mx/about`,
      lastModified: NOW,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/api/mx/memory`,
      lastModified: NOW,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/api/mx/opportunities`,
      lastModified: NOW,
      changeFrequency: 'hourly', // Live Scout Agent data
      priority: 0.9,
    },

    // ── Platform information pages (future routes, pre-declared) ─────────────
    {
      url: `${SITE_URL}/about`,
      lastModified: NOW,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];
}
