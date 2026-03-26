export const runtime = "nodejs";
/**
 * CMS AI Generation — Groq-backed content generation
 *
 * Fixes:
 *   - hasOwnProperty guard on SYSTEM_PROMPTS (not truthiness — prevents prototype bypass)
 *   - fetchErr narrowed to `unknown` with instanceof Error guard
 *   - errText sanitized before logging (no raw user content in logs)
 *   - Missing GROQ_API_KEY fails loudly in production; mock only in development
 *   - 15s AbortController timeout on Groq fetch
 */
import { NextResponse } from "next/server";
import { log, generateRequestId } from "@/lib/api-utils";
import { getTokenFromRequest, verifySession } from "@/lib/auth/session";

const SERVICE = "cms-ai-generate";
const GROQ_TIMEOUT = 15_000;

const SYSTEM_PROMPTS: Record<string, string> = {
  title:
    'You are an expert content writer. Generate 3 compelling, SEO-friendly article titles. Return JSON: {"result": "Best title", "alternatives": ["Title 2", "Title 3"]}',
  excerpt:
    'You are a content editor. Write a compelling 1-2 sentence excerpt/summary. Return JSON: {"result": "The excerpt", "alternatives": []}',
  content:
    'You are a professional content writer for South African creators. Write engaging, well-structured article content with proper HTML formatting (h2, h3, p, ul, li tags). Return JSON: {"result": "<html content>", "alternatives": []}',
  seo: 'You are an SEO expert. Write an optimized meta title (under 60 chars). Return JSON: {"result": "SEO title", "alternatives": ["Alt 1", "Alt 2"]}',
  tags: 'You are a content tagger. Suggest 5-8 relevant tags as a comma-separated list. Return JSON: {"result": "tag1, tag2, tag3", "alternatives": []}',
  rewrite:
    'You are a writing coach. Rewrite the provided text to be clearer, more engaging, and professional. Return JSON: {"result": "Rewritten text", "alternatives": []}',
  expand:
    'You are a content writer. Expand the provided text with more detail, examples, and depth. Return JSON: {"result": "Expanded text", "alternatives": []}',
};

const LENGTH_TOKENS: Record<string, number> = {
  short: 300,
  medium: 600,
  long: 1200,
};

export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const token = getTokenFromRequest(req);
  const session = token ? await verifySession(token) : null;
  if (!session)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      type = "content",
      prompt = "",
      context = "",
      tone = "professional",
      length = "medium",
    } = body;

    // FIX: own-property guard prevents prototype-chain bypass (e.g. __proto__, constructor)
    if (!Object.prototype.hasOwnProperty.call(SYSTEM_PROMPTS, type)) {
      return NextResponse.json(
        { error: "INVALID_TYPE", message: `Unknown type: ${String(type)}` },
        { status: 400 },
      );
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      // FIX: mock only in development — fail loudly in production
      if (process.env.NODE_ENV === "development") {
        return NextResponse.json({
          result: `[DEV mock ${type}: ${String(prompt).substring(0, 50)}...]`,
          alternatives: [`DEV alt 1 for ${type}`, `DEV alt 2 for ${type}`],
        });
      }
      log({
        level: "error",
        service: SERVICE,
        message: "GROQ_API_KEY not set",
        requestId,
      });
      return NextResponse.json(
        {
          error: "SERVICE_MISCONFIGURED",
          message: "AI generation not configured.",
        },
        { status: 500 },
      );
    }

    const userMessage = [
      prompt ? `Topic/Context: ${String(prompt)}` : "",
      context ? `Existing content: ${String(context).substring(0, 1000)}` : "",
      `Tone: ${String(tone)}`,
      type === "content" || type === "expand"
        ? `Length: ${String(length)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    // FIX: AbortController timeout — route cannot hang indefinitely
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort("timeout"), GROQ_TIMEOUT);

    let res: Response;
    try {
      res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: SYSTEM_PROMPTS[type] },
            { role: "user", content: userMessage || "Generate content" },
          ],
          max_tokens: LENGTH_TOKENS[length] ?? 600,
          temperature: 0.75,
          stream: false,
        }),
        signal: ac.signal,
      });
    } catch (fetchErr: unknown) {
      clearTimeout(tid);
      // FIX: fetchErr typed as unknown — use instanceof guard before .name access
      const isTimeout =
        fetchErr instanceof Error && fetchErr.name === "AbortError";
      log({
        level: "warn",
        service: SERVICE,
        requestId,
        message: isTimeout ? "Groq request timed out" : "Groq fetch failed",
      });
      return NextResponse.json(
        {
          error: isTimeout ? "AI_TIMEOUT" : "AI_UNAVAILABLE",
          message: isTimeout
            ? "AI request timed out."
            : "AI temporarily unavailable.",
        },
        { status: 504 },
      );
    }
    clearTimeout(tid);

    if (!res.ok) {
      // FIX: log only status + sanitized note — never log errText which may contain user prompts
      log({
        level: "warn",
        service: SERVICE,
        requestId,
        message: `Groq upstream error`,
        httpStatus: res.status,
        note: "raw body omitted to avoid logging user content",
      });
      return NextResponse.json(
        { error: "AI_UNAVAILABLE", message: "AI temporarily unavailable" },
        { status: 502 },
      );
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";

    let parsed: { result?: string; alternatives?: string[] };
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { result: raw };
    } catch {
      parsed = { result: raw };
    }

    log({
      level: "info",
      service: SERVICE,
      message: `Generated ${type}`,
      requestId,
    });
    return NextResponse.json({
      result: parsed.result ?? "",
      alternatives: parsed.alternatives ?? [],
    });
  } catch (err) {
    log({
      level: "error",
      service: SERVICE,
      message: "AI generation failed",
      requestId,
      errMsg: String(err),
    });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
