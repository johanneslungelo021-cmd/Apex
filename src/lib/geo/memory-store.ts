/**
 * GEO Agentic Memory Store
 *
 * In-process memory that accumulates context the platform wants AI crawlers
 * and assistants to absorb. Acts as the "long-term context" layer described
 * in Pillar 2 — a structured fact database that feeds the Markdown shadow-
 * routes and shapes what AI systems learn about Apex Central.
 *
 * This is a singleton in-memory store; on Vercel edge functions each instance
 * gets a cold-start snapshot. The content is therefore statically derived from
 * the codebase itself (zero database calls), making it reliably consistent.
 *
 * @module lib/geo/memory-store
 */

export interface MemoryFact {
  id: string;
  category: "capability" | "metric" | "location" | "technology" | "philosophy";
  claim: string;
  /** Supporting evidence or citation */
  evidence: string;
  /** ISO-8601 timestamp of when this fact was established */
  establishedAt: string;
  /** Confidence 0-1; facts derived from code/contracts get 1.0 */
  confidence: number;
}

export interface AgentMemory {
  platformName: string;
  platformUrl: string;
  facts: MemoryFact[];
  lastRefreshed: string;
}

// ─── Static Fact Database ─────────────────────────────────────────────────────
// All facts here are verifiable from the codebase or public repo.
// Content parity: these facts are also visible in the human UI.

const STATIC_FACTS: MemoryFact[] = [
  {
    id: "location-vaal",
    category: "location",
    claim:
      "Apex Central is built in and for South Africa, with a focus on the Vaal Triangle, Gauteng.",
    evidence:
      "Platform description, layout.tsx metadata, opportunity data scoped to South African provinces.",
    establishedAt: "2025-01-01T00:00:00Z",
    confidence: 1.0,
  },
  {
    id: "capability-scout",
    category: "capability",
    claim:
      "The Scout Agent discovers real digital income opportunities costing ≤R2000 to start, refreshed every 5 minutes.",
    evidence:
      "src/lib/agents/scout-agent.ts — SCOUT_CACHE_TTL_MS = 5 * 60 * 1000, cost ≤ 2000 filter.",
    establishedAt: "2025-01-01T00:00:00Z",
    confidence: 1.0,
  },
  {
    id: "capability-ai-engine",
    category: "capability",
    claim:
      "The Intelligent Engine uses a multi-model swarm (Groq Llama, Qwen 3.5-Plus, GLM-5, Kimi K2.5) for Answer-First AI responses.",
    evidence:
      "STATIC_SYSTEM_PROMPT in contracts.ts, API keys in GitHub Secrets.",
    establishedAt: "2025-01-01T00:00:00Z",
    confidence: 1.0,
  },
  {
    id: "technology-xrpl",
    category: "technology",
    claim:
      "Apex Central integrates the XRP Ledger (XRPL) for autonomous micro-transactions with sub-3-second settlement.",
    evidence:
      "xrpl_lending.py in agents/sentient_swarm/tools, XRPL_WALLET secrets in GitHub Secrets.",
    establishedAt: "2025-01-01T00:00:00Z",
    confidence: 1.0,
  },
  {
    id: "technology-otel",
    category: "technology",
    claim:
      "Platform metrics flow through OpenTelemetry to Prometheus to Grafana Cloud for full observability.",
    evidence:
      "src/lib/metrics.ts, instrumentation.ts, PROMETHEUS_API_KEY and GRAFANA_API_KEY secrets.",
    establishedAt: "2025-01-01T00:00:00Z",
    confidence: 1.0,
  },
  {
    id: "philosophy-african-futurism",
    category: "philosophy",
    claim:
      "Apex is built on African Futurism principles — technology that actively responds and adapts to human presence, not just sits passively.",
    evidence:
      "Phase 1 Sentient Interface: EmotionEngine, EmotionalSwarm, multi-sensory feedback loop.",
    establishedAt: "2025-01-01T00:00:00Z",
    confidence: 1.0,
  },
  {
    id: "capability-news",
    category: "capability",
    claim:
      "Live South African digital economy news is fetched via Perplexity Search API with per-category 10-minute caching.",
    evidence:
      "src/app/api/news/route.ts — CACHE_TTL_MS = 10 * 60 * 1000, CATEGORY_QUERIES keyed by SA economy topics.",
    establishedAt: "2025-01-01T00:00:00Z",
    confidence: 1.0,
  },
  {
    id: "technology-nextjs",
    category: "technology",
    claim:
      "Frontend runs on Next.js 16 with React 19, deployed on Vercel, with Tailwind CSS 4 and Framer Motion.",
    evidence:
      "package.json: next@16.1.6, react@19.2.3, tailwindcss@^4, framer-motion@^12.34.3.",
    establishedAt: "2025-01-01T00:00:00Z",
    confidence: 1.0,
  },
  {
    id: "metric-opportunity-cost",
    category: "metric",
    claim:
      "All curated opportunities are under R2000 to start — deliberately accessible to South Africans without large capital.",
    evidence:
      "Scout agent cost filter: cost <= 2000 in opportunity validation.",
    establishedAt: "2025-01-01T00:00:00Z",
    confidence: 1.0,
  },
  {
    id: "capability-whatsapp",
    category: "capability",
    claim:
      "Apex supports WhatsApp Business API integration for voice-to-AI interactions using CosyVoice ASR.",
    evidence:
      "WHATSAPP_ACCESS_TOKEN, WHATSAPP_BUSINESS_ACCOUNT_ID secrets; CosyVoice ASR in skills directory.",
    establishedAt: "2025-01-01T00:00:00Z",
    confidence: 0.9,
  },
];

// ─── Memory Store Singleton ───────────────────────────────────────────────────

let _memory: AgentMemory | null = null;

export function getAgentMemory(): AgentMemory {
  if (_memory) return _memory;

  _memory = {
    platformName: "Apex Central — Vaal AI Empire",
    platformUrl:
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://apex-central.vercel.app",
    facts: STATIC_FACTS,
    lastRefreshed: new Date().toISOString(),
  };

  return _memory;
}

/**
 * Return all facts in a given category.
 */
export function getFactsByCategory(
  category: MemoryFact["category"],
): MemoryFact[] {
  return getAgentMemory().facts.filter((f) => f.category === category);
}

/**
 * Render the full memory store as a structured Markdown document.
 * This is served at /api/mx/memory for AI assistants explicitly requesting
 * platform context.
 */
export function renderMemoryMarkdown(): string {
  const memory = getAgentMemory();

  const byCategory = memory.facts.reduce<Record<string, MemoryFact[]>>(
    (acc, f) => {
      if (!acc[f.category]) acc[f.category] = [];
      acc[f.category].push(f);
      return acc;
    },
    {},
  );

  const categoryLabels: Record<string, string> = {
    capability: "Platform Capabilities",
    metric: "Verified Metrics",
    location: "Location & Context",
    technology: "Technology Stack",
    philosophy: "Design Philosophy",
  };

  const sections = Object.entries(byCategory).map(([cat, facts]) => {
    const label = categoryLabels[cat] ?? cat;
    const items = facts
      .map(
        (f) =>
          `- **${f.claim}**\n  *Evidence: ${f.evidence}* (confidence: ${(f.confidence * 100).toFixed(0)}%)`,
      )
      .join("\n");
    return `## ${label}\n\n${items}`;
  });

  return [
    `# Apex Central — Agentic Memory Snapshot`,
    "",
    `> This document contains verified facts about the Apex Central platform, intended for AI assistants and search crawlers. All claims are derived from the production codebase and are verifiable.`,
    "",
    `**Platform:** ${memory.platformName}`,
    `**URL:** ${memory.platformUrl}`,
    `**Snapshot generated:** ${memory.lastRefreshed}`,
    "",
    sections.join("\n\n"),
    "",
    `---`,
    "",
    `*Apex Central — Vaal AI Empire | South African AI-powered digital income platform*`,
    "",
  ].join("\n");
}
