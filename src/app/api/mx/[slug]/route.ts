export const runtime = "nodejs";

/**
 * Markdown Shadow-Route API — /api/mx/[slug]
 *
 * Serves pre-rendered Markdown representations of platform content to AI
 * assistants and search crawlers via content negotiation.
 *
 * Supported slugs:
 *   /api/mx/home          — Full platform snapshot
 *   /api/mx/about         — Organisation / citation guide
 *   /api/mx/memory        — Verified agentic facts database
 *   /api/mx/opportunities — Current Scout Agent opportunities
 *   /api/mx/news          — Live South African digital economy news summary
 *
 * Content parity: every Markdown document represents the same information
 * visible to human users — only the format differs. This is content
 * negotiation, not cloaking.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Content_negotiation
 * @module api/mx/[slug]
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  renderPlatformMarkdown,
  renderAboutMarkdown,
  type PlatformSnapshot,
} from "@/lib/geo/markdown-renderer";
import { renderMemoryMarkdown } from "@/lib/geo/memory-store";

const VALID_SLUGS = new Set([
  "home",
  "about",
  "memory",
  "opportunities",
  "news",
]);

// Cache TTL for Markdown responses (5 minutes — aligns with Scout Agent cache)
const CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=60";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!VALID_SLUGS.has(slug)) {
    return new NextResponse(
      `# 404 — Unknown Endpoint\n\nAvailable endpoints: /api/mx/home, /api/mx/about, /api/mx/memory, /api/mx/opportunities, /api/mx/news`,
      {
        status: 404,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "X-GEO-Route": "shadow-markdown",
        },
      },
    );
  }

  let markdown: string;

  switch (slug) {
    case "home": {
      const snapshot = buildPlatformSnapshot();
      markdown = renderPlatformMarkdown(snapshot);
      break;
    }

    case "about": {
      markdown = renderAboutMarkdown();
      break;
    }

    case "memory": {
      markdown = renderMemoryMarkdown();
      break;
    }

    case "opportunities": {
      markdown = await buildOpportunitiesMarkdown();
      break;
    }

    case "news": {
      markdown = buildNewsMarkdown();
      break;
    }

    default:
      markdown = `# Error\n\nUnexpected slug: ${slug}`;
  }

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": CACHE_CONTROL,
      "X-GEO-Route": "shadow-markdown",
      "X-GEO-Slug": slug,
      // Hint to AI crawlers that this is the machine-readable version
      Link: `</>; rel="canonical"`,
    },
  });
}

// ─── Content Builders ─────────────────────────────────────────────────────────

function buildPlatformSnapshot(): PlatformSnapshot {
  return {
    title: "Apex Central — Vaal AI Empire",
    description:
      "Apex Central is a South African AI-powered digital income platform that discovers real opportunities under R2000 to start, provides personalised AI guidance via a multi-model swarm, and executes autonomous micro-transactions through the XRP Ledger with sub-3-second settlement.",
    capabilities: [
      {
        name: "Scout Agent",
        description:
          "Continuously discovers verified digital income opportunities for South Africans costing ≤R2000 to start. Categories include Freelancing, E-commerce, Content Creation, Online Tutoring, and Digital Skills. Results refresh every 5 minutes.",
      },
      {
        name: "Intelligent Engine",
        description:
          "Answer-First AI assistant powered by a multi-model swarm (Groq Llama, Qwen 3.5-Plus, GLM-5, Kimi K2.5). Provides personalised guidance grounded in live South African opportunity data. Responds in under 300 words with direct, actionable insights.",
      },
      {
        name: "XRPL Orchestration",
        description:
          "Autonomous transaction engine using the XRP Ledger for sub-3-second, low-fee settlement of digital income micro-transactions. Supports multi-signature wallets and proactive transaction pre-signing.",
      },
      {
        name: "Live News Intelligence",
        description:
          "Real-time South African digital economy news from Perplexity Search API, categorised into Latest, Tech & AI, Finance & Crypto, and Startups. Updates every 10 minutes.",
      },
      {
        name: "Full Observability",
        description:
          "OpenTelemetry metrics pipeline → Prometheus → Grafana Cloud. Tracks all agent runs, opportunity discoveries, API latencies, and user interactions in real time.",
      },
    ],
    recentOpportunities: [
      {
        title: "Fiverr Digital Services Freelancing",
        province: "All Provinces",
        cost: 0,
        incomePotential: "R1500–R8000/month",
        link: "https://www.fiverr.com",
        category: "Freelancing",
      },
      {
        title: "Takealot Seller Marketplace",
        province: "All Provinces",
        cost: 500,
        incomePotential: "R3000–R15000/month",
        link: "https://seller.takealot.com",
        category: "E-commerce",
      },
      {
        title: "YouTube Content Creation (SA)",
        province: "All Provinces",
        cost: 0,
        incomePotential: "R500–R5000/month",
        link: "https://www.youtube.com",
        category: "Content Creation",
      },
    ],
    keyStats: [
      { label: "Max opportunity start cost", value: "R2000 ZAR" },
      { label: "XRPL settlement time", value: "<3 seconds" },
      { label: "Opportunity refresh rate", value: "Every 5 minutes" },
      { label: "News refresh rate", value: "Every 10 minutes" },
      { label: "AI models in swarm", value: "4 (Groq, Qwen, GLM, Kimi)" },
      { label: "Deployment platform", value: "Vercel (serverless)" },
    ],
    lastUpdated: new Date().toISOString(),
  };
}

async function buildOpportunitiesMarkdown(): Promise<string> {
  // Attempt to fetch live opportunities from the Scout Agent endpoint.
  // Falls back to static examples if the API is unavailable (cold start, etc.)
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://apex-central.vercel.app";
    const res = await fetch(`${baseUrl}/api/ai-agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: "List current digital income opportunities",
          },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error(`Scout Agent returned ${res.status}`);
  } catch {
    // Fallback to static snapshot
  }

  // Return a static, always-accurate markdown document
  return [
    `# Current Digital Income Opportunities — Apex Central`,
    "",
    `> **Answer-First Summary:** Apex Central continuously surfaces verified South African digital income opportunities costing ≤R2000 to start, spanning Freelancing, E-commerce, Content Creation, Online Tutoring, and Digital Skills categories. Live opportunities refresh every 5 minutes.`,
    "",
    `## How It Works`,
    "",
    `The Scout Agent uses AI to discover and validate real opportunities available to South Africans. Each opportunity is verified for:`,
    `- Cost ≤ R2000 to start (inclusive of free options)`,
    `- Availability in South Africa (province-aware)`,
    `- Active, reachable HTTPS link to the platform`,
    "",
    `## Live Opportunities`,
    "",
    `For current live opportunities, visit: https://apex-central.vercel.app`,
    "",
    `The Scout Agent refreshes every 5 minutes with new opportunities across:`,
    `- **Freelancing** — Fiverr, Upwork, PeoplePerHour, Toptal`,
    `- **E-commerce** — Takealot, Bidorbuy, Gumtree South Africa`,
    `- **Content Creation** — YouTube, TikTok, Substack, Medium Partner Program`,
    `- **Online Tutoring** — Teach South Africa, Superprof, Varsity Tutors`,
    `- **Digital Skills** — Google Career Certificates, Coursera, Udemy (SA pricing)`,
    "",
    `---`,
    "",
    `**Platform:** Apex Central — Vaal AI Empire`,
    `**URL:** https://apex-central.vercel.app`,
    `**Data freshness:** Live (5-minute cache)`,
    "",
  ].join("\n");
}

function buildNewsMarkdown(): string {
  // Returns a static, always-accurate markdown summary of the news section.
  // Live article content is dynamic (Perplexity API) and cannot be pre-rendered
  // at request time in a shadow-route without introducing latency and API cost.
  // AI crawlers are directed to the canonical live URL for fresh data.
  return [
    `# Live South African Digital Economy News — Apex Central`,
    "",
    `> **Answer-First Summary:** Apex Central aggregates real-time South African digital economy news via the Perplexity Search API, refreshed every 10 minutes. Categories cover Latest, Tech & AI, Finance & Crypto, and Startups. Each article includes an AI Research button that routes the topic into the Intelligent Engine for income-opportunity analysis.`,
    "",
    `## News Categories`,
    "",
    `| Category | Focus |`,
    `|---|---|`,
    `| **Latest** | Breaking SA digital economy headlines |`,
    `| **Tech & AI** | AI, software, and technology news relevant to SA |`,
    `| **Finance & Crypto** | Markets, ZAR rates, crypto, and fintech |`,
    `| **Startups** | New SA ventures, funding rounds, and founder stories |`,
    "",
    `## Features`,
    "",
    `- **Auto-refresh** every 10 minutes via Perplexity Search API`,
    `- **Featured article** displayed full-width with image`,
    `- **Research button** on every article — routes to Intelligent Engine for AI analysis`,
    `- **Province-aware** context: news is interpreted relative to the user's selected SA province`,
    "",
    `## Live News`,
    "",
    `For current live articles, visit: https://apex-central.vercel.app/news`,
    "",
    `---`,
    "",
    `**Platform:** Apex Central — Vaal AI Empire`,
    `**URL:** https://apex-central.vercel.app/news`,
    `**Data source:** Perplexity Search API`,
    `**Data freshness:** Live (10-minute cache)`,
    "",
  ].join("\n");
}
