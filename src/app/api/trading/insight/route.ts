export const runtime = "nodejs";

/**
 * Trading Insight API
 *
 * Generates a single live market insight sentence using Groq,
 * conditioned on the current market state (volatile vs stable).
 * Called by the trading page InsightTicker every 30s.
 */

import { NextResponse } from "next/server";
import {
  log,
  generateRequestId,
  fetchWithTimeout,
  checkRateLimit,
} from "@/lib/api-utils";

const SERVICE = "trading-insight";

export interface InsightResponse {
  insight: string;
  state: "volatile" | "stable";
  generatedAt: string;
}

export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (!checkRateLimit(`insight:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const isVolatile = (body as Record<string, unknown>)?.volatile === true;
  const zarUsd =
    typeof (body as Record<string, unknown>)?.zarUsd === "number"
      ? ((body as Record<string, unknown>).zarUsd as number)
      : null;
  const xrpZar =
    typeof (body as Record<string, unknown>)?.xrpZar === "number"
      ? ((body as Record<string, unknown>).xrpZar as number)
      : null;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY not configured" },
      { status: 503 },
    );
  }

  const systemPrompt = isVolatile
    ? "You are a senior South African financial analyst monitoring XRPL and ZAR markets in real time. The market is currently VOLATILE. Generate exactly ONE concise, authoritative insight sentence (max 25 words) about current trading conditions. Mention specific ZAR or XRPL context. Do not use quotes. Return ONLY the sentence."
    : "You are a senior South African financial analyst monitoring XRPL and ZAR markets in real time. The market is currently STABLE. Generate exactly ONE concise, actionable insight sentence (max 25 words) about current market opportunity. Mention ZAR or XRPL context. Do not use quotes. Return ONLY the sentence.";

  const userMsg = [
    isVolatile ? "Volatile session detected." : "Stable session in progress.",
    zarUsd ? `ZAR/USD: ${zarUsd.toFixed(2)}.` : "",
    xrpZar ? `XRP/ZAR: R${xrpZar.toFixed(2)}.` : "",
    "Generate one insight for the trading floor ticker.",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const res = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          max_tokens: 80,
          temperature: 0.65,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMsg },
          ],
        }),
      },
      10_000,
    );

    if (!res.ok) throw new Error(`Groq ${res.status}`);
    const raw = await res.json();
    const insight: string = (
      (raw?.choices?.[0]?.message?.content as string) ?? ""
    ).trim();

    log({
      level: "info",
      service: SERVICE,
      message: "Insight generated",
      requestId,
      volatile: isVolatile,
    });

    return NextResponse.json({
      insight:
        insight ||
        "Market conditions nominal. Monitor ZAR corridor for opportunity.",
      state: isVolatile ? "volatile" : "stable",
      generatedAt: new Date().toISOString(),
    } satisfies InsightResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log({
      level: "error",
      service: SERVICE,
      message: "Insight generation failed",
      requestId,
      error: msg,
    });
    return NextResponse.json(
      { error: "GENERATION_FAILED", message: msg },
      { status: 503 },
    );
  }
}
