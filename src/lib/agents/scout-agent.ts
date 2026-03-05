/**
 * Scout Agent Module
 *
 * Discovers digital income opportunities in South Africa using Groq AI.
 * Results are cached for 5 minutes to prevent API hammering on concurrent requests.
 *
 * The scout validates all opportunity URLs to prevent hallucinated links
 * from reaching users. Each opportunity must have a real HTTPS URL.
 *
 * @module lib/agents/scout-agent
 *
 * @example
 * import { runScoutAgent, type Opportunity } from '@/lib/agents/scout-agent';
 *
 * const opportunities = await runScoutAgent();
 * console.log(`Found ${opportunities.length} opportunities`);
 */

import { log, generateRequestId, fetchWithTimeout, safeJsonParse, envTimeoutMs, isValidHttpUrl } from '../api-utils';
import { scoutRunCounter, scoutOpportunitiesCounter } from '../metrics';

const SERVICE = 'scout-agent';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A validated digital income opportunity for South African users.
 */
export interface Opportunity {
  /** Opportunity title */
  title: string;
  /** South African province (e.g., "Gauteng" or "All Provinces") */
  province: string;
  /** Cost in ZAR (0-2000) */
  cost: number;
  /** Income potential description (e.g., "R3000–R8000/month") */
  incomePotential: string;
  /** Validated HTTPS URL to the platform or course */
  link: string;
  /** Opportunity category */
  category: string;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

/** Cache TTL: 5 minutes — prevents Groq hammering on concurrent requests */
const SCOUT_CACHE_TTL_MS = 5 * 60 * 1000;

/** Cached opportunities with timestamp */
let scoutCache: { opportunities: Opportunity[]; cachedAt: number } | null = null;

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates a single raw opportunity object from Groq.
 * Returns a typed Opportunity or null if required fields are missing/invalid.
 * Rejects entries with invalid URLs to prevent hallucinated links reaching users.
 *
 * @param raw - The raw opportunity object from Groq
 * @returns Validated Opportunity or null if invalid
 *
 * @example
 * const raw = { title: "Test", province: "Gauteng", cost: 500, ... };
 * const validated = validateOpportunity(raw);
 */
function validateOpportunity(raw: unknown): Opportunity | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  if (
    typeof r.title !== 'string' || !r.title.trim() ||
    typeof r.province !== 'string' || !r.province.trim() ||
    typeof r.cost !== 'number' || r.cost < 0 || r.cost > 2000 ||
    typeof r.incomePotential !== 'string' || !r.incomePotential.trim() ||
    typeof r.link !== 'string' || !isValidHttpUrl(r.link) ||
    typeof r.category !== 'string' || !r.category.trim()
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

// ─── Main ─────────────────────────────────────────────────────────────────────

/** Groq API timeout in milliseconds (configurable via GROQ_TIMEOUT_MS env) */
const GROQ_TIMEOUT_MS = envTimeoutMs(process.env.GROQ_TIMEOUT_MS, 12_000);

/**
 * Runs the Scout Agent to find digital income opportunities in South Africa.
 *
 * Results are cached for 5 minutes to prevent repeated Groq API calls on
 * concurrent requests. Returns a validated, typed array — never throws.
 * Falls back to stale cache on any error rather than returning empty.
 *
 * @returns Array of validated opportunities
 *
 * @example
 * const opportunities = await runScoutAgent();
 * opportunities.forEach(o => console.log(o.title, o.cost));
 */
export async function runScoutAgent(): Promise<Opportunity[]> {
  // Return cached data if still fresh
  if (scoutCache && Date.now() - scoutCache.cachedAt < SCOUT_CACHE_TTL_MS) {
    return scoutCache.opportunities;
  }

  const requestId = generateRequestId();
  const startMs = Date.now();

  log({ level: 'info', service: SERVICE, message: 'Scout agent started (cache miss)', requestId });

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    log({ level: 'warn', service: SERVICE, message: 'GROQ_API_KEY not set — returning empty opportunities', requestId });
    return [];
  }

  try {
    const response = await fetchWithTimeout(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 800,
          temperature: 0.6,
          messages: [
            {
              role: 'system',
              content:
                'You are the Apex Scout Agent. Return ONLY a valid JSON array — no markdown, no extra text, no code fences. ' +
                'Find exactly 3 real digital income opportunities available to South Africans (cost ≤ R2000). ' +
                'Each object must have these exact keys: ' +
                '"title" (string), "province" (string, e.g. "Gauteng" or "All Provinces"), ' +
                '"cost" (number in ZAR, 0-2000), "incomePotential" (string, e.g. "R3000–R8000/month"), ' +
                '"link" (string, a real reachable HTTPS URL to the platform or course), ' +
                '"category" (string, one of: "Freelancing", "E-commerce", "Content Creation", "Online Tutoring", "Digital Skills"). ' +
                'Return ONLY the JSON array. No preamble, no explanation.',
            },
          ],
        }),
      },
      GROQ_TIMEOUT_MS,
    );

    if (!response.ok) {
      log({
        level: 'warn', service: SERVICE,
        message: `Groq returned HTTP ${response.status} — using stale cache or empty`,
        requestId, durationMs: Date.now() - startMs,
      });
      scoutRunCounter.add(1, { status: 'error' });
      return scoutCache?.opportunities ?? [];
    }

    const data = await response.json();
    const rawContent: string = data?.choices?.[0]?.message?.content ?? '[]';

    // Strip accidental markdown fences Groq sometimes adds despite prompt instructions
    const cleaned = rawContent.replace(/```json|```/g, '').trim();
    const parsed = safeJsonParse<unknown[]>(cleaned);

    if (!Array.isArray(parsed)) {
      log({
        level: 'warn', service: SERVICE,
        message: 'Groq response was not a JSON array — using stale cache or empty',
        requestId, rawContent,
      });
      scoutRunCounter.add(1, { status: 'error' });
      return scoutCache?.opportunities ?? [];
    }

    const opportunities: Opportunity[] = parsed
      .map(validateOpportunity)
      .filter((o): o is Opportunity => o !== null);

    scoutRunCounter.add(1, { status: 'success' });
    scoutOpportunitiesCounter.add(opportunities.length);

    log({
      level: 'info', service: SERVICE,
      message: `Scout completed — ${opportunities.length} valid opportunities`,
      requestId, durationMs: Date.now() - startMs,
    });

    scoutCache = { opportunities, cachedAt: Date.now() };
    return opportunities;

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof Error && err.name === 'AbortError';

    scoutRunCounter.add(1, { status: isTimeout ? 'timeout' : 'error' });

    log({
      level: 'error', service: SERVICE,
      message: isTimeout ? 'Scout timed out' : 'Scout fetch failed',
      requestId, error: errMsg, durationMs: Date.now() - startMs,
    });

    // Return stale cache rather than empty if available — better UX
    return scoutCache?.opportunities ?? [];
  }
}
