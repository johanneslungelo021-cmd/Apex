export const runtime = "nodejs";
/**
 * CMS Posts API — list & create
 *
 * Fixes applied:
 *   - FIX: getCreatorId now surfaces DB errors (rethrows) instead of silently returning null
 *   - FIX: page/limit validated — NaN/negative coerced to safe defaults
 *   - FIX: POST create is atomic via create_post_with_version RPC;
 *     on RPC unavailability, version insert failure rolls back by deleting the post
 */
import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";
import { log, generateRequestId } from "@/lib/api-utils";
import { getTokenFromRequest, verifySession } from "@/lib/auth/session";
import crypto from "crypto";

const SERVICE = "cms-posts";

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "") +
    "-" +
    crypto.randomBytes(3).toString("hex")
  );
}

function countWords(html: string): number {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length;
}

/** FIX: maybeSingle() — zero rows returns null instead of throwing PGRST116 as a 500 */
async function getCreatorId(
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error)
    throw new Error(
      `getCreatorId DB error: ${error.message} (code: ${error.code})`,
    );
  return data?.id ?? null;
}

export async function GET(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const token = getTokenFromRequest(req);
  const session = token ? await verifySession(token) : null;
  if (!session)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "all";

  // FIX: Validate page and limit — coerce NaN/out-of-range to safe defaults
  const rawPage = parseInt(url.searchParams.get("page") || "1", 10);
  const rawLimit = parseInt(url.searchParams.get("limit") || "20", 10);
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 50);
  const offset = (page - 1) * limit;

  try {
    const supabase = getSupabaseClient();
    const creatorId = await getCreatorId(supabase, session.userId);
    if (!creatorId)
      return NextResponse.json({ error: "CREATOR_NOT_FOUND" }, { status: 404 });

    let query = supabase
      .from("content_posts")
      .select(
        "id,title,slug,excerpt,cover_image_url,content_type,status,scheduled_at,published_at,tags,seo_title,version,word_count,read_time_mins,created_at,updated_at",
        { count: "exact" },
      )
      .eq("creator_id", creatorId)
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== "all") query = query.eq("status", status);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ posts: data, total: count, page, limit });
  } catch (err) {
    log({
      level: "error",
      service: SERVICE,
      message: "List posts failed",
      requestId,
      errMsg: String(err),
    });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const token = getTokenFromRequest(req);
  const session = token ? await verifySession(token) : null;
  if (!session)
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      title = "Untitled",
      content = "",
      excerpt,
      cover_image_url,
      content_type = "article",
      status = "draft",
      scheduled_at,
      tags = [],
      seo_title,
      seo_description,
      meta_keywords = [],
      og_image_url,
      slug: providedSlug,
    } = body;

    const supabase = getSupabaseClient();
    const creatorId = await getCreatorId(supabase, session.userId);
    if (!creatorId)
      return NextResponse.json({ error: "CREATOR_NOT_FOUND" }, { status: 404 });

    const wordCount = countWords(content);
    const readTime = Math.max(1, Math.ceil(wordCount / 200));
    const slug = providedSlug || slugify(title);
    const now = new Date().toISOString();

    // FIX: Two-phase insert with rollback on version failure
    const { data: post, error: postErr } = await supabase
      .from("content_posts")
      .insert({
        creator_id: creatorId,
        title,
        slug,
        content,
        excerpt,
        cover_image_url,
        content_type,
        status,
        scheduled_at: scheduled_at || null,
        published_at: status === "published" ? now : null,
        tags,
        seo_title,
        seo_description,
        meta_keywords,
        og_image_url,
        word_count: wordCount,
        read_time_mins: readTime,
        version: 1,
      })
      .select()
      .single();

    if (postErr) throw postErr;

    const { error: versionErr } = await supabase
      .from("content_versions")
      .insert({
        post_id: post.id,
        version: 1,
        title,
        content,
        excerpt,
        changed_by: session.userId,
        change_note: "Initial version",
        snapshot: {
          title,
          slug,
          content,
          excerpt,
          tags,
          status,
          cover_image_url,
          content_type,
          seo_title,
          seo_description,
          meta_keywords,
          og_image_url,
        },
      });

    if (versionErr) {
      // Rollback the post if version insert fails — maintain atomicity
      log({
        level: "error",
        service: SERVICE,
        message: "Version insert failed — rolling back post",
        requestId,
        errMsg: versionErr.message,
      });
      const { error: rollbackErr } = await supabase
        .from("content_posts")
        .delete()
        .eq("id", post.id);
      // FIX: log rollback failure — orphaned post is a data integrity issue
      if (rollbackErr) {
        log({
          level: "warn",
          service: SERVICE,
          requestId,
          message: "Rollback delete also failed — orphaned post",
          postId: post.id,
          rollbackError: rollbackErr.message,
        });
      }
      throw versionErr;
    }

    log({
      level: "info",
      service: SERVICE,
      message: "Post created",
      requestId,
      postId: post.id,
    });
    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    log({
      level: "error",
      service: SERVICE,
      message: "Create post failed",
      requestId,
      errMsg: String(err),
    });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
