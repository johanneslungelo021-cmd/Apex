/**
 * Scout Agent — Perplexity Sonar powered
 *
 * Uses Perplexity Sonar (web-search enabled) to discover REAL, current
 * digital income opportunities for South Africans ≤ R2000 to start.
 * Groq was replaced because it has no web access — Perplexity Sonar
 * searches the live internet and returns cited, verifiable results.
 *
 * Cache: 5-minute TTL to avoid hammering the API.
 */

import {
  log,
  generateRequestId,
  fetchWithTimeout,
  safeJsonParse,
  envTimeoutMs,
  isValidHttpsUrl,
} from "../api-utils";
import { scoutRunCounter, scoutOpportunitiesCounter } from "../metrics";

const SERVICE = "scout-agent";
const PERPLEXITY_TIMEOUT_MS = envTimeoutMs(
  process.env.PERPLEXITY_TIMEOUT_MS,
  18_000,
);
const SCOUT_CACHE_TTL_MS = 5 * 60 * 1000;

export interface Opportunity {
  title: string;
  province: string;
  cost: number;
  incomePotential: string;
  link: string;
  category: string;
}

let scoutCache: { opportunities: Opportunity[]; cachedAt: number } | null =
  null;

const ALLOWED_CATEGORIES = new Set([
  "Freelancing",
  "E-commerce",
  "Content Creation",
  "Online Tutoring",
  "Digital Skills",
]);

function validateOpportunity(raw: unknown): Opportunity | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  if (
    typeof r.title !== "string" ||
    !r.title.trim() ||
    typeof r.province !== "string" ||
    !r.province.trim() ||
    typeof r.cost !== "number" ||
    r.cost < 0 ||
    r.cost > 2000 ||
    typeof r.incomePotential !== "string" ||
    !r.incomePotential.trim() ||
    typeof r.link !== "string" ||
    !isValidHttpsUrl(r.link) ||
    typeof r.category !== "string" ||
    !ALLOWED_CATEGORIES.has(r.category)
  ) {
    return null;
  }

  return {
    title: r.title.trim(),
    province: r.province.trim(),
    cost: r.cost,
    incomePotential: r.incomePotential.trim(),
    link: r.link.trim(),
    category: r.category.trim(),
  };
}

export async function runScoutAgent(): Promise<Opportunity[]> {
  if (scoutCache && Date.now() - scoutCache.cachedAt < SCOUT_CACHE_TTL_MS) {
    return scoutCache.opportunities;
  }

  const requestId = generateRequestId();
  const startMs = Date.now();

  log({
    level: "info",
    service: SERVICE,
    message: "Scout agent started (Perplexity Sonar)",
    requestId,
  });

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    log({
      level: "warn",
      service: SERVICE,
      message: "PERPLEXITY_API_KEY not set",
      requestId,
    });
    return [];
  }

  try {
    const response = await fetchWithTimeout(
      "https://api.perplexity.ai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          max_tokens: 1200,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You are the Apex Scout Agent. Search the web for REAL, current digital income opportunities available to South Africans today. " +
                "Return ONLY a valid JSON array — no markdown, no code fences, no preamble. " +
                "Find exactly 5 real opportunities with cost ≤ R2000 to start. " +
                "Each object must have these exact keys: " +
                '"title" (string), "province" (string, e.g. "Gauteng" or "All Provinces"), ' +
                '"cost" (number in ZAR, 0-2000), "incomePotential" (string, e.g. "R3000–R8000/month"), ' +
                '"link" (string, a real reachable HTTPS URL to the actual platform or course), ' +
                '"category" (one of: "Freelancing", "E-commerce", "Content Creation", "Online Tutoring", "Digital Skills"). ' +
                "Use real platforms: Fiverr, Upwork, Takealot, Bidorbuy, YouTube, TikTok, Udemy, Coursera, etc. " +
                "Return ONLY the JSON array.",
            },
            {
              role: "user",
              content: `Find 5 real digital income opportunities for South Africans in ${new Date().getFullYear()} that cost under R2000 to start. Search for current, active platforms and courses.`,
            },
          ],
        }),
      },
      PERPLEXITY_TIMEOUT_MS,
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      log({
        level: "warn",
        service: SERVICE,
        message: `Perplexity ${response.status}: ${errText.slice(0, 200)}`,
        requestId,
        durationMs: Date.now() - startMs,
      });
      scoutRunCounter.add(1, { status: "error" });
      return scoutCache?.opportunities ?? [];
    }

    const data = await response.json();
    const rawContent: string = data?.choices?.[0]?.message?.content ?? "[]";
    const cleaned = rawContent.replace(/```json|```/g, "").trim();

    // Perplexity sometimes wraps in extra text — extract the JSON array
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    const parsed = safeJsonParse<unknown[]>(
      arrayMatch ? arrayMatch[0] : cleaned,
    );

    if (!Array.isArray(parsed)) {
      log({
        level: "warn",
        service: SERVICE,
        message: "Perplexity response not a JSON array",
        requestId,
        rawContent,
      });
      scoutRunCounter.add(1, { status: "error" });
      return scoutCache?.opportunities ?? [];
    }

    const opportunities: Opportunity[] = parsed
      .map(validateOpportunity)
      .filter((o): o is Opportunity => o !== null);

    scoutRunCounter.add(1, { status: "success" });
    scoutOpportunitiesCounter.add(opportunities.length);
    log({
      level: "info",
      service: SERVICE,
      message: `Scout found ${opportunities.length} verified opportunities`,
      requestId,
      durationMs: Date.now() - startMs,
    });

    scoutCache = { opportunities, cachedAt: Date.now() };
    return opportunities;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    scoutRunCounter.add(1, { status: isTimeout ? "timeout" : "error" });
    log({
      level: "error",
      service: SERVICE,
      message: isTimeout ? "Scout timed out" : "Scout failed",
      requestId,
      error: errMsg,
      durationMs: Date.now() - startMs,
    });
    return scoutCache?.opportunities ?? [];
  }
}
