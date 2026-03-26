/**
 * Search API Route — Perplexity-powered web search
 *
 * Powers the skills web-search adapter (src/lib/skills/web-search.ts).
 * Results are formatted for 100vw × 400px result cards as per the
 * unified validation checklist (document 4, skill adapter spec).
 *
 * Uses ONLY the PERPLEXITY_API_KEY from repo secrets — no other data sources.
 * Results are SA-focused by default and bias toward digital economy content.
 *
 * Used by:
 *   - src/lib/skills/web-search.ts — calls GET /api/search?q=...
 *   - src/app/page.tsx (indirectly, via Scout Agent → news/ai-agent routes)
 *
 * @module api/search
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, generateRequestId, log } from "@/lib/api-utils";
import { searchQueryCounter } from "@/lib/observability/pillar4Metrics";

const SERVICE = "search-api";
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const PERPLEXITY_TIMEOUT_MS = 10_000;

/** Shape of each result card — matches the 100vw × 400px card spec. */
export interface SearchResult {
  title: string;
  source: string;
  url: string;
  snippet: string;
  date: string | null;
  category: "opportunity" | "news" | "guide" | "market_data" | "general";
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  cached: boolean;
  retrievedAt: string;
}

const cache = new Map<string, { data: SearchResponse; ts: number }>();
const CACHE_TTL_MS = 15 * 60 * 1_000;

function classifyResult(title: string, url: string): SearchResult["category"] {
  const t = title.toLowerCase();
  const u = url.toLowerCase();
  if (/freelan|fiverr|upwork|earn|income|job|opportunit|hustl|gig/.test(t))
    return "opportunity";
  if (/jse|zar|rand|btc|crypto|xrp|market|index|rate|price/.test(t + u))
    return "market_data";
  if (/how to|guide|tutorial|learn|course|step.by.step/.test(t)) return "guide";
  if (/news|report|update|breaking|latest|says|announces/.test(t))
    return "news";
  return "general";
}

export async function GET(request: NextRequest): Promise<Response> {
  const requestId = generateRequestId();
  const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";

  if (!checkRateLimit(ip, RATE_LIMIT, RATE_WINDOW_MS)) {
    searchQueryCounter.add(1, { status: "rate_limited" });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const rawQuery = (searchParams.get("q") ?? "").trim();
  if (!rawQuery)
    return NextResponse.json(
      { error: "Missing query parameter: q" },
      { status: 400 },
    );

  const query = rawQuery
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x1F]/g, "")
    .slice(0, 500);

  const cached = cache.get(query);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    searchQueryCounter.add(1, { status: "cache_hit" });
    return NextResponse.json({ ...cached.data, cached: true });
  }

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    log({
      level: "error",
      service: SERVICE,
      message: "PERPLEXITY_API_KEY not configured",
      requestId,
    });
    return NextResponse.json(
      { error: "Search service not configured" },
      { status: 503 },
    );
  }

  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), PERPLEXITY_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        max_tokens: 1200,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: [
              "You are a real-time web search API for a South African digital income platform.",
              "Given a search query, find the 5 most relevant recent results from the live web.",
              "Return ONLY a valid JSON array — no markdown, no code fences, no explanation.",
              'Each element: "title" (string), "source" (domain), "url" (full URL),',
              '"snippet" (2-3 sentences), "date" (ISO-8601 or null).',
              "Prioritise South African sources. Every URL must be a real, accessible link.",
            ].join(" "),
          },
          { role: "user", content: `Search for: ${query}` },
        ],
      }),
      signal: ac.signal,
    });

    clearTimeout(tid);
    if (!response.ok) throw new Error(`Perplexity HTTP ${response.status}`);

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data?.choices?.[0]?.message?.content ?? "[]";
    const cleaned = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    let parsed: {
      title?: string;
      source?: string;
      url?: string;
      snippet?: string;
      date?: string | null;
    }[] = [];
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = [];
    }

    const results: SearchResult[] = parsed.slice(0, 5).map((r) => ({
      title: String(r.title ?? "").slice(0, 200),
      source: String(r.source ?? "").slice(0, 100),
      url: String(r.url ?? ""),
      snippet: String(r.snippet ?? "").slice(0, 600),
      date: r.date != null ? String(r.date) : null,
      category: classifyResult(String(r.title ?? ""), String(r.url ?? "")),
    }));

    const body: SearchResponse = {
      results,
      query,
      cached: false,
      retrievedAt: new Date().toISOString(),
    };
    cache.set(query, { data: body, ts: Date.now() });
    searchQueryCounter.add(1, { status: "success" });
    log({
      level: "info",
      service: SERVICE,
      message: `Returned ${results.length} results`,
      requestId,
    });
    return NextResponse.json(body);
  } catch (err) {
    clearTimeout(tid);
    const msg = err instanceof Error ? err.message : String(err);
    log({
      level: "error",
      service: SERVICE,
      message: `Search failed: ${msg}`,
      requestId,
    });
    searchQueryCounter.add(1, { status: "error" });
    return NextResponse.json(
      { error: "Search failed", details: msg },
      { status: 502 },
    );
  }
}

export const revalidate = 900;
