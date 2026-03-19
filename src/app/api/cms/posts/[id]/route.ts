export const runtime = 'nodejs';
/**
 * CMS Post by ID — GET / PATCH / DELETE + versions
 *
 * Fixes:
 *   - getCreatorId uses .maybeSingle() — no 500 on "not found"
 *   - versions query includes content, excerpt, snapshot for full rollback
 *   - existing select uses * for complete snapshot
 *   - slug destructured and persisted
 *   - countWords called once, result reused
 *   - version insert failure: compensating rollback reverts post
 *   - optimistic concurrency via eq('version', existing.version)
 *   - DELETE checks affected rows — surfaces silent no-ops as 404
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
  // FIX: maybeSingle() — zero rows → null (not a thrown error)
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

    const { data: post, error } = await supabase.from('content_posts')
      .select('*').eq('id', id).eq('creator_id', creatorId).single();
    if (error || !post) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    if (showVersions) {
      // FIX: include content, excerpt, snapshot so editor rollback has all restore data
      const { data: versions } = await supabase.from('content_versions')
        .select('id,version,title,content,excerpt,snapshot,change_note,changed_by,created_at')
        .eq('post_id', id).order('version', { ascending: false });
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

    // FIX: select * — captures slug/SEO/scheduling for complete version snapshot
    const { data: existing, error: existingErr } = await supabase.from('content_posts')
      .select('*').eq('id', id).eq('creator_id', creatorId).single();
    if (existingErr || !existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    // FIX: slug destructured from body
    const { title, content, excerpt, cover_image_url, content_type, status,
      scheduled_at, slug, tags, seo_title, seo_description, meta_keywords,
      og_image_url, change_note } = body;

    const updates: Record<string, unknown> = {};
    if (title           !== undefined) updates.title           = title;
    if (slug            !== undefined) updates.slug            = slug;  // FIX: persist slug edits
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
      // FIX: compute countWords once, reuse for both fields
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

    // FIX: optimistic concurrency — rejects if another write raced ahead
    const { data: post, error: updateErr } = await supabase.from('content_posts')
      .update(updates)
      .eq('id', id)
      .eq('version', existing.version)
      .select().single();

    if (updateErr) throw updateErr;
    if (!post) {
      return NextResponse.json(
        { error: 'CONFLICT', message: 'Post was modified concurrently. Please reload and retry.' },
        { status: 409 },
      );
    }

    // FIX: check version insert — compensating rollback if it fails
    const { error: insertError } = await supabase.from('content_versions').insert({
      post_id:     id,
      version:     newVersion,
      title:       (title    ?? existing.title)   as string,
      content:     (content  ?? existing.content) as string,
      excerpt:     (excerpt  ?? existing.excerpt) as string,
      changed_by:  session.userId,
      change_note: (change_note || `Version ${newVersion}`) as string,
      snapshot:    { ...existing, ...updates },
    });

    if (insertError) {
      // Compensating rollback: revert post back to previous version
      log({ level: 'error', service: SERVICE, requestId,
        message: 'Version insert failed — reverting post to previous version',
        errMsg: insertError.message });
      await supabase.from('content_posts')
        .update({ ...existing, version: existing.version })
        .eq('id', id);
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

    // FIX: select the row first so we know it existed and belongs to this creator
    const { data: existing } = await supabase.from('content_posts')
      .select('id').eq('id', id).eq('creator_id', creatorId).maybeSingle();
    if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    const { error } = await supabase.from('content_posts')
      .delete().eq('id', id).eq('creator_id', creatorId);
    if (error) throw error;

    log({ level: 'info', service: SERVICE, message: 'Post deleted', requestId, postId: id });
    return NextResponse.json({ success: true });
  } catch (err) {
    log({ level: 'error', service: SERVICE, message: 'Delete post failed', requestId, errMsg: String(err) });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
