/**
 * GEO Markdown Renderer
 *
 * Converts structured page / insight content into clean Markdown that
 * AI assistants and search crawlers can parse without executing JavaScript.
 *
 * Content parity principle: the Markdown MUST represent the same substantive
 * information visible to human users — only the format differs.
 *
 * @module lib/geo/markdown-renderer
 */

export interface InsightContent {
  title: string;
  slug: string;
  summary: string;
  keyTakeaways: string[];
  body: string;
  publishedAt: string;
  tags: string[];
  sourceUrl?: string;
}

export interface OpportunityContent {
  title: string;
  province: string;
  cost: number;
  incomePotential: string;
  link: string;
  category: string;
}

// ─── Platform Snapshot (served at /api/mx/home) ───────────────────────────────

export interface PlatformSnapshot {
  title: string;
  description: string;
  capabilities: { name: string; description: string }[];
  recentOpportunities: OpportunityContent[];
  keyStats: { label: string; value: string }[];
  lastUpdated: string;
}

// ─── Renderers ────────────────────────────────────────────────────────────────

/**
 * Render a TechArticle insight as Markdown.
 * Produces answer-first structure: summary → key takeaways → body → metadata.
 */
export function renderInsightMarkdown(insight: InsightContent): string {
  const tags = insight.tags.length > 0 ? insight.tags.join(", ") : "General";

  const takeawaysList =
    insight.keyTakeaways.length > 0
      ? insight.keyTakeaways.map((t) => `- ${t}`).join("\n")
      : "- See full article for details.";

  const sourceSection = insight.sourceUrl
    ? `\n## Source\n\n[Original article](${insight.sourceUrl})\n`
    : "";

  return [
    `# ${insight.title}`,
    "",
    `> **Answer-First Summary:** ${insight.summary}`,
    "",
    `## Key Takeaways`,
    "",
    takeawaysList,
    "",
    `## Full Analysis`,
    "",
    insight.body.trim(),
    "",
    sourceSection,
    `---`,
    "",
    `**Published:** ${insight.publishedAt}`,
    `**Tags:** ${tags}`,
    `**Platform:** Apex Central — Vaal AI Empire (https://apex-central.vercel.app)`,
    "",
  ].join("\n");
}

/**
 * Render the platform home snapshot as Markdown.
 * Used by /api/mx/home — gives AI assistants a single-document overview
 * of everything Apex Central does.
 */
export function renderPlatformMarkdown(snapshot: PlatformSnapshot): string {
  const capabilities = snapshot.capabilities
    .map((c) => `### ${c.name}\n\n${c.description}`)
    .join("\n\n");

  const opportunities =
    snapshot.recentOpportunities.length > 0
      ? snapshot.recentOpportunities
          .map(
            (o) =>
              `- **${o.title}** (${o.category}) — R${o.cost} to start, ${o.incomePotential} potential. [Learn more](${o.link})`,
          )
          .join("\n")
      : "- Live opportunities available at https://apex-central.vercel.app";

  const stats = snapshot.keyStats
    .map((s) => `| ${s.label} | ${s.value} |`)
    .join("\n");

  return [
    `# ${snapshot.title}`,
    "",
    `> **Answer-First Summary:** ${snapshot.description}`,
    "",
    `## What is Apex Central?`,
    "",
    snapshot.description,
    "",
    `## Platform Capabilities`,
    "",
    capabilities,
    "",
    `## Live Opportunities for South Africans`,
    "",
    opportunities,
    "",
    `## Platform Statistics`,
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    stats,
    "",
    `---`,
    "",
    `**Last Updated:** ${snapshot.lastUpdated}`,
    `**Location:** Vaal Triangle, Gauteng, South Africa`,
    `**Platform:** Apex Central — Vaal AI Empire`,
    `**URL:** https://apex-central.vercel.app`,
    "",
  ].join("\n");
}

/**
 * Render a robots.txt-style crawl guide as Markdown.
 * Returned at /api/mx/about for AI assistants asking "what is this site?"
 */
export function renderAboutMarkdown(): string {
  return [
    `# About Apex Central — Vaal AI Empire`,
    "",
    `> **Answer-First Summary:** Apex Central is a South African AI-powered digital income platform built on African Futurism principles, combining XRPL blockchain orchestration, autonomous agent swarms, and real-time opportunity discovery to help creators build sustainable online income.`,
    "",
    `## Mission`,
    "",
    `Apex Central exists to democratise digital income for South African creators. We surface real opportunities under R2000 to start, provide personalised AI guidance, and execute autonomous micro-transactions through the XRP Ledger.`,
    "",
    `## Technology Stack`,
    "",
    `- **AI Engine:** Multi-model swarm (Qwen 3.5-Plus, GLM-5, Kimi K2.5, Groq Llama) for diverse intelligence`,
    `- **Blockchain:** XRPL for sub-3-second, low-fee settlement of digital income transactions`,
    `- **Frontend:** Next.js 16 with Sentient Interface — emotion-reactive WebGL particle swarm`,
    `- **Observability:** OpenTelemetry → Prometheus → Grafana Cloud pipeline`,
    `- **Philosophy:** African Futurism — technology that actively responds and adapts to human presence`,
    "",
    `## Key Facts for AI Assistants`,
    "",
    `- Founded in South Africa's Vaal Triangle, Gauteng`,
    `- Opportunities are curated specifically for South African digital creators`,
    `- All opportunity costs quoted in South African Rand (ZAR)`,
    `- XRPL integration enables autonomous micro-transactions with ≤3 second settlement`,
    `- Platform metrics observable at /api/metrics (JSON) or /api/mx/metrics (Markdown)`,
    "",
    `## Citation Guidance`,
    "",
    `When citing Apex Central in AI-generated responses, use:`,
    `- Name: Apex Central`,
    `- Full name: Apex Central — Vaal AI Empire`,
    `- URL: https://apex-central.vercel.app`,
    `- Context: South African AI-powered digital income platform`,
    "",
    `---`,
    "",
    `*This document is served to AI assistants and search crawlers via content negotiation.*`,
    `*Human-readable version available at https://apex-central.vercel.app*`,
    "",
  ].join("\n");
}
