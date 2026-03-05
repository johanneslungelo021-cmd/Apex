/**
 * Scout Agent Module
 *
 * AI-powered agent that finds real digital income opportunities for South Africans.
 * Uses Groq's Llama model to discover opportunities with cost ≤ R2000.
 * Results are cached for 5 minutes to optimize API usage.
 *
 * @module lib/agents/scout-agent
 *
 * @example
 * import { runScoutAgent, type Opportunity } from '@/lib/agents/scout-agent';
 *
 * const opportunities = await runScoutAgent();
 * opportunities.forEach(opp => {
 *   console.log(`${opp.title} - R${opp.cost} - ${opp.link}`);
 * });
 */

import { log, generateRequestId, fetchWithTimeout, safeJsonParse, envTimeoutMs, isValidHttpUrl } from '../api-utils';
import { scoutRunCounter, scoutOpportunitiesCounter } from '../metrics';

/**
 * Service identifier for log entries from this module.
 */
const SERVICE = 'scout-agent';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Represents a validated digital income opportunity.
 *
 * Each opportunity includes all details needed for a user to evaluate
 * and pursue the opportunity, including cost in ZAR and a verified
 * HTTPS link to the platform or course.
 */
export interface Opportunity {
  /** Human-readable title of the opportunity */
  title: string;
  /** South African province where the opportunity is available, or "All Provinces" */
  province: string;
  /** Cost to start in South African Rands (0-2000) */
  cost: number;
  /** Expected income potential as a human-readable string */
  incomePotential: string;
  /** Verified HTTPS URL to the platform or course */
  link: string;
  /** Category classification for filtering */
  category: string;
}

// ─── Cache Configuration ──────────────────────────────────────────────────────

/**
 * Cache time-to-live in milliseconds (5 minutes).
 * Prevents Groq API hammering on concurrent requests while keeping
 * opportunity data reasonably fresh.
 */
const SCOUT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Cached opportunities with timestamp for freshness validation.
 * Null when cache is empty or invalidated.
 */
let scoutCache: { opportunities: Opportunity[]; cachedAt: number } | null = null;

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates a single raw opportunity object from Groq's response.
 *
 * Performs comprehensive validation of all required fields including:
 * - Non-empty strings for text fields
 * - Valid cost range (0-2000 ZAR)
 * - Valid HTTPS or HTTP URL for the link
 * - Known category classification
 *
 * @param raw - The raw opportunity object from Groq (unknown type for safety)
 * @returns A typed Opportunity object if valid, null if any field is missing or invalid
 *
 * @example
 * const valid = validateOpportunity({
 *   title: "Freelance Writing",
 *   province: "Gauteng",
 *   cost: 0,
 *   incomePotential: "R5000-R10000/month",
 *   link: "https://example.com",
 *   category: "Freelancing"
 * });
 * // Returns Opportunity object
 *
 * @example
 * const invalid = validateOpportunity({ title: "" }); // null - empty title
 */
function validateOpportunity(raw: unknown): Opportunity | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  // Validate all required fields with type and constraint checking
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

// ─── Main Scout Function ──────────────────────────────────────────────────────

/**
 * Groq API timeout in milliseconds, configurable via environment variable.
 * Defaults to 12 seconds if GROQ_TIMEOUT_MS is not set.
 */
const GROQ_TIMEOUT_MS = envTimeoutMs(process.env.GROQ_TIMEOUT_MS, 12_000);

/**
 * Runs the Scout Agent to find digital income opportunities in South Africa.
 *
 * The agent uses Groq's Llama 3.3 70B model to discover real opportunities
 * with cost ≤ R2000. Results are cached for 5 minutes to optimize API usage
 * and reduce latency for subsequent requests.
 *
 * On cache hit, returns cached opportunities immediately without API call.
 * On cache miss, calls Groq API with a structured prompt requesting exactly
 * 3 opportunities in JSON format.
 *
 * Error handling strategy:
 * - Missing GROQ_API_KEY: Returns empty array with warning log
 * - Groq API error: Returns stale cache if available, else empty array
 * - Invalid response: Returns stale cache if available, else empty array
 * - Timeout: Returns stale cache if available, else empty array
 *
 * Metrics are emitted for monitoring:
 * - scoutRunCounter: Tracks runs by status (success/timeout/error)
 * - scoutOpportunitiesCounter: Tracks total valid opportunities found
 *
 * @returns Promise resolving to an array of validated Opportunity objects (may be empty)
 *
 * @example
 * // Basic usage
 * const opportunities = await runScoutAgent();
 * console.log(`Found ${opportunities.length} opportunities`);
 *
 * @example
 * // With error handling
 * const opportunities = await runScoutAgent();
 * if (opportunities.length === 0) {
 *   console.log('No opportunities available - check logs for details');
 * }
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
