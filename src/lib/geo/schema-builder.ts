/**
 * GEO Schema Builder
 *
 * Generates schema.org JSON-LD structured data objects for pages and
 * content blocks. Handles WebSite, Organization, and TechArticle types
 * with speakable selectors that point at AgentReadableChunk summaries.
 *
 * @module lib/geo/schema-builder
 */

export interface OrganizationSchema {
  [key: string]: unknown;
  "@context": "https://schema.org";
  "@type": "Organization";
  name: string;
  url: string;
  description: string;
  foundingLocation: { "@type": "Place"; name: string };
  knowsAbout: string[];
  sameAs: string[];
}

export interface WebSiteSchema {
  [key: string]: unknown;
  "@context": "https://schema.org";
  "@type": "WebSite";
  name: string;
  url: string;
  description: string;
  inLanguage: string;
  potentialAction: {
    "@type": "SearchAction";
    target: { "@type": "EntryPoint"; urlTemplate: string };
    "query-input": string;
  };
}

export interface TechArticleSchema {
  [key: string]: unknown;
  "@context": "https://schema.org";
  "@type": "TechArticle";
  headline: string;
  abstract: string;
  datePublished: string;
  dateModified: string;
  inLanguage: string;
  author: { "@type": "Organization"; name: string; url: string };
  publisher: { "@type": "Organization"; name: string; url: string };
  about: { "@type": "Thing"; name: string; description: string };
  speakable: { "@type": "SpeakableSpecification"; cssSelector: string[] };
  keywords: string[];
  isPartOf: { "@type": "WebSite"; name: string; url: string };
}

// ─── Apex Platform Constants ──────────────────────────────────────────────────

const APEX_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://apex-central.vercel.app";
const APEX_NAME = "Apex Central — Vaal AI Empire";
const APEX_DESCRIPTION =
  "A living digital platform helping South African creators build sustainable digital income through AI-powered opportunity discovery, XRPL autonomous orchestration, and real-time market intelligence.";

// ─── Schema Builders ──────────────────────────────────────────────────────────

export function buildOrganizationSchema(): OrganizationSchema {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: APEX_NAME,
    url: APEX_URL,
    description: APEX_DESCRIPTION,
    foundingLocation: {
      "@type": "Place",
      name: "Vaal Triangle, Gauteng, South Africa",
    },
    knowsAbout: [
      "XRPL blockchain orchestration",
      "South African digital income",
      "AI agent swarms",
      "DeFi settlement infrastructure",
      "African Futurism technology",
      "Generative AI platforms",
    ],
    sameAs: ["https://github.com/johanneslungelo021-cmd/Apex"],
  };
}

export function buildWebSiteSchema(): WebSiteSchema {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: APEX_NAME,
    url: APEX_URL,
    description: APEX_DESCRIPTION,
    inLanguage: "en-ZA",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${APEX_URL}/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export interface TechArticleOptions {
  headline: string;
  abstract: string;
  slug: string;
  keywords: string[];
  aboutName: string;
  aboutDescription: string;
  /** ISO-8601 string; defaults to build date */
  datePublished?: string;
  /** ISO-8601 string; defaults to datePublished */
  dateModified?: string;
  /** Extra CSS selectors to include in speakable alongside the default geo selectors */
  extraSpeakableSelectors?: string[];
}

export function buildTechArticleSchema(
  opts: TechArticleOptions,
): TechArticleSchema {
  const now = new Date().toISOString();
  const published = opts.datePublished ?? now;
  const modified = opts.dateModified ?? published;

  // Default speakable selectors target AgentReadableChunk summaries and hero H1
  const speakableSelectors = [
    ".geo-answer-first",
    "h1",
    ".key-takeaways",
    ...(opts.extraSpeakableSelectors ?? []),
  ];

  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: opts.headline,
    abstract: opts.abstract,
    datePublished: published,
    dateModified: modified,
    inLanguage: "en-ZA",
    author: {
      "@type": "Organization",
      name: APEX_NAME,
      url: APEX_URL,
    },
    publisher: {
      "@type": "Organization",
      name: APEX_NAME,
      url: APEX_URL,
    },
    about: {
      "@type": "Thing",
      name: opts.aboutName,
      description: opts.aboutDescription,
    },
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: speakableSelectors,
    },
    keywords: opts.keywords,
    isPartOf: {
      "@type": "WebSite",
      name: APEX_NAME,
      url: APEX_URL,
    },
  };
}

/**
 * Serialise a schema object to a compact JSON string safe for injection
 * into a <script type="application/ld+json"> tag.
 *
 * We use JSON.stringify without pretty-printing to minimise page weight.
 */
export function serialiseSchema(schema: Record<string, unknown>): string {
  return JSON.stringify(schema);
}
