export const runtime = 'nodejs';
/**
 * CMS Post by ID — GET / PATCH / DELETE + versions
 *
 * Fixes in this revision:
 *   - versions query checks error, surfaces 500 on DB failure
 *   - update uses .maybeSingle() so version-mismatch PGRST116 → null (→ 409), not 500
 *   - compensating rollback constrained by eq('version', newVersion) + eq('creator_id')
 *     and checks row count to detect whether revert actually matched
 */
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { log, generateRequestId } from '@/lib/api-utils';
import { getTokenFromRequest, verifySession } from '@/lib/auth/session';

const SERVICE = 'cms-post';

function countWords(html: string): number {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
}

async function getCreatorId(supabase: ReturnType<typeof getSupabaseClient>, userId: string): Promise<string | null> {
  // maybeSingle() — zero rows → null (not a thrown PGRST116 error)
  const { data, error } = await supabase.from('creators').select('id').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`getCreatorId DB error: ${error.message} (code: ${error.code})`);
  return data?.id ?? null;
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const requestId = generateRequestId();
  const token   = getTokenFromRequest(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await ctx.params;
  const showVersions = new URL(req.url).searchParams.get('versions') === 'true';

  try {
    const supabase  = getSupabaseClient();
    const creatorId = await getCreatorId(supabase, session.userId);
    if (!creatorId) return NextResponse.json({ error: 'CREATOR_NOT_FOUND' }, { status: 404 });

    const { data: post, error: postError } = await supabase.from('content_posts')
      .select('*').eq('id', id).eq('creator_id', creatorId).single();
    if (postError || !post) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    if (showVersions) {
      // FIX: destructure error — surface DB failures as 500 instead of empty array
      const { data: versions, error: versionsError } = await supabase.from('content_versions')
        .select('id,version,title,content,excerpt,snapshot,change_note,changed_by,created_at')
        .eq('post_id', id).order('version', { ascending: false });
      if (versionsError) {
        log({ level: 'error', service: SERVICE, message: 'Versions query failed', requestId, errMsg: versionsError.message });
        return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Failed to load version history' }, { status: 500 });
      }
      return NextResponse.json({ post, versions: versions ?? [] });
    }
    return NextResponse.json({ post });
  } catch (err) {
    log({ level: 'error', service: SERVICE, message: 'Get post failed', requestId, errMsg: String(err) });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  const requestId = generateRequestId();
  const token   = getTokenFromRequest(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const supabase  = getSupabaseClient();
    const creatorId = await getCreatorId(supabase, session.userId);
    if (!creatorId) return NextResponse.json({ error: 'CREATOR_NOT_FOUND' }, { status: 404 });

    // select * for complete snapshot — slug/SEO/scheduling all preserved
    const { data: existing, error: existingErr } = await supabase.from('content_posts')
      .select('*').eq('id', id).eq('creator_id', creatorId).single();
    if (existingErr || !existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    const { title, content, excerpt, cover_image_url, content_type, status,
      scheduled_at, slug, tags, seo_title, seo_description, meta_keywords,
      og_image_url, change_note } = body;

    const updates: Record<string, unknown> = {};
    if (title           !== undefined) updates.title           = title;
    if (slug            !== undefined) updates.slug            = slug;
    if (excerpt         !== undefined) updates.excerpt         = excerpt;
    if (cover_image_url !== undefined) updates.cover_image_url = cover_image_url;
    if (content_type    !== undefined) updates.content_type    = content_type;
    if (tags            !== undefined) updates.tags            = tags;
    if (seo_title       !== undefined) updates.seo_title       = seo_title;
    if (seo_description !== undefined) updates.seo_description = seo_description;
    if (meta_keywords   !== undefined) updates.meta_keywords   = meta_keywords;
    if (og_image_url    !== undefined) updates.og_image_url    = og_image_url;
    if (scheduled_at    !== undefined) updates.scheduled_at    = scheduled_at;
    if (content !== undefined) {
      const wc = countWords(content);
      updates.content        = content;
      updates.word_count     = wc;
      updates.read_time_mins = Math.max(1, Math.ceil(wc / 200));
    }
    if (status !== undefined) {
      updates.status = status;
      if (status === 'published' && existing.status !== 'published') {
        updates.published_at = new Date().toISOString();
      }
    }

    const newVersion = existing.version + 1;
    updates.version  = newVersion;

    // FIX: maybeSingle() — PGRST116 (zero rows = version mismatch) → null → 409, not 500
    const { data: post, error: updateErr } = await supabase.from('content_posts')
      .update(updates)
      .eq('id', id)
      .eq('version', existing.version)  // optimistic concurrency lock
      .select().maybeSingle();

    if (updateErr) throw updateErr;
    if (!post) {
      return NextResponse.json(
        { error: 'CONFLICT', message: 'Post was modified concurrently. Please reload and retry.' },
        { status: 409 },
      );
    }

    const { error: insertError } = await supabase.from('content_versions').insert({
      post_id:     id,
      version:     newVersion,
      title:       (title   ?? existing.title)   as string,
      content:     (content ?? existing.content) as string,
      excerpt:     (excerpt ?? existing.excerpt) as string,
      changed_by:  session.userId,
      change_note: (change_note || `Version ${newVersion}`) as string,
      snapshot:    { ...existing, ...updates },
    });

    if (insertError) {
      log({ level: 'error', service: SERVICE, requestId,
        message: 'Version insert failed — attempting compensating rollback',
        errMsg: insertError.message });

      // FIX: rollback constrained by newVersion + creator_id to avoid clobbering newer concurrent writes
      const { data: revertData, error: revertErr } = await supabase.from('content_posts')
        .update({ ...existing, version: existing.version })
        .eq('id', id)
        .eq('version', newVersion)           // only revert if our write is still current
        .eq('creator_id', existing.creator_id)
        .select('id').maybeSingle();

      if (revertErr || !revertData) {
        log({ level: 'warn', service: SERVICE, requestId,
          message: 'Compensating rollback did not match any row — post may have been updated concurrently' });
      }
      throw insertError;
    }

    log({ level: 'info', service: SERVICE, message: 'Post updated', requestId, postId: id, version: newVersion });
    return NextResponse.json({ post });
  } catch (err) {
    log({ level: 'error', service: SERVICE, message: 'Update post failed', requestId, errMsg: String(err) });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  const requestId = generateRequestId();
  const token   = getTokenFromRequest(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await ctx.params;

  try {
    const supabase  = getSupabaseClient();
    const creatorId = await getCreatorId(supabase, session.userId);
    if (!creatorId) return NextResponse.json({ error: 'CREATOR_NOT_FOUND' }, { status: 404 });

    // FIX: Single atomic delete with creator_id filter — no TOCTOU gap
    // Returns empty result if no rows matched (not found or not owner)
    const { data, error } = await supabase.from('content_posts')
      .delete()
      .eq('id', id)
      .eq('creator_id', creatorId)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    log({ level: 'info', service: SERVICE, message: 'Post deleted', requestId, postId: id });
    return NextResponse.json({ success: true });
  } catch (err) {
    log({ level: 'error', service: SERVICE, message: 'Delete post failed', requestId, errMsg: String(err) });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
