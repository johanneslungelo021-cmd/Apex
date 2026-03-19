export const runtime = 'nodejs';
/**
 * CMS Post by ID — GET / PATCH / DELETE + versions
 * GET    /api/cms/posts/:id
 * PATCH  /api/cms/posts/:id
 * DELETE /api/cms/posts/:id
 * GET    /api/cms/posts/:id?versions=true
 * POST   /api/cms/posts/:id?rollback=:version
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
  const { data } = await supabase.from('creators').select('id').eq('user_id', userId).single();
  return data?.id ?? null;
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const requestId = generateRequestId();
  const token = getTokenFromRequest(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const showVersions = url.searchParams.get('versions') === 'true';

  try {
    const supabase = getSupabaseClient();
    const creatorId = await getCreatorId(supabase, session.userId);
    if (!creatorId) return NextResponse.json({ error: 'CREATOR_NOT_FOUND' }, { status: 404 });

    const { data: post, error } = await supabase.from('content_posts')
      .select('*').eq('id', id).eq('creator_id', creatorId).single();
    if (error || !post) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    if (showVersions) {
      const { data: versions } = await supabase.from('content_versions')
        .select('id,version,title,change_note,changed_by,created_at')
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
  const token = getTokenFromRequest(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const supabase = getSupabaseClient();
    const creatorId = await getCreatorId(supabase, session.userId);
    if (!creatorId) return NextResponse.json({ error: 'CREATOR_NOT_FOUND' }, { status: 404 });

    // Check ownership
    const { data: existing } = await supabase.from('content_posts')
      .select('id,version,title,content,excerpt,tags,status').eq('id', id).eq('creator_id', creatorId).single();
    if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

    const { title, content, excerpt, cover_image_url, content_type, status, scheduled_at,
      tags, seo_title, seo_description, meta_keywords, og_image_url, change_note } = body;

    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (content !== undefined) {
      updates.content = content;
      updates.word_count = countWords(content);
      updates.read_time_mins = Math.max(1, Math.ceil(countWords(content) / 200));
    }
    if (excerpt !== undefined) updates.excerpt = excerpt;
    if (cover_image_url !== undefined) updates.cover_image_url = cover_image_url;
    if (content_type !== undefined) updates.content_type = content_type;
    if (tags !== undefined) updates.tags = tags;
    if (seo_title !== undefined) updates.seo_title = seo_title;
    if (seo_description !== undefined) updates.seo_description = seo_description;
    if (meta_keywords !== undefined) updates.meta_keywords = meta_keywords;
    if (og_image_url !== undefined) updates.og_image_url = og_image_url;
    if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at;

    // Status transitions
    if (status !== undefined) {
      updates.status = status;
      if (status === 'published' && existing.status !== 'published') {
        updates.published_at = new Date().toISOString();
      }
    }

    const newVersion = existing.version + 1;
    updates.version = newVersion;

    const { data: post, error } = await supabase.from('content_posts')
      .update(updates).eq('id', id).select().single();
    if (error) throw error;

    // Save version snapshot
    await supabase.from('content_versions').insert({
      post_id: id,
      version: newVersion,
      title: title ?? existing.title,
      content: content ?? existing.content,
      excerpt: excerpt ?? existing.excerpt,
      changed_by: session.userId,
      change_note: change_note || `Version ${newVersion}`,
      snapshot: { ...existing, ...updates },
    });

    log({ level: 'info', service: SERVICE, message: 'Post updated', requestId, postId: id, version: newVersion });
    return NextResponse.json({ post });
  } catch (err) {
    log({ level: 'error', service: SERVICE, message: 'Update post failed', requestId, errMsg: String(err) });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  const requestId = generateRequestId();
  const token = getTokenFromRequest(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { id } = await ctx.params;

  try {
    const supabase = getSupabaseClient();
    const creatorId = await getCreatorId(supabase, session.userId);
    if (!creatorId) return NextResponse.json({ error: 'CREATOR_NOT_FOUND' }, { status: 404 });

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
