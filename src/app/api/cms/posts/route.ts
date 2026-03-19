export const runtime = 'nodejs';
/**
 * CMS Posts API — list & create
 * GET  /api/cms/posts?status=draft&page=1&limit=20
 * POST /api/cms/posts
 */
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { log, generateRequestId } from '@/lib/api-utils';
import { getTokenFromRequest, verifySession } from '@/lib/auth/session';
import crypto from 'crypto';

const SERVICE = 'cms-posts';

function slugify(text: string): string {
  return text.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '')
    + '-' + crypto.randomBytes(3).toString('hex');
}

function countWords(html: string): number {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
}

async function getCreatorId(supabase: ReturnType<typeof getSupabaseClient>, userId: string): Promise<string | null> {
  const { data } = await supabase.from('creators').select('id').eq('user_id', userId).single();
  return data?.id ?? null;
}

export async function GET(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const token = getTokenFromRequest(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'all';
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 50);
  const offset = (page - 1) * limit;

  try {
    const supabase = getSupabaseClient();
    const creatorId = await getCreatorId(supabase, session.userId);
    if (!creatorId) return NextResponse.json({ error: 'CREATOR_NOT_FOUND' }, { status: 404 });

    let query = supabase.from('content_posts')
      .select('id,title,slug,excerpt,cover_image_url,content_type,status,scheduled_at,published_at,tags,seo_title,version,word_count,read_time_mins,created_at,updated_at', { count: 'exact' })
      .eq('creator_id', creatorId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== 'all') query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ posts: data, total: count, page, limit });
  } catch (err) {
    log({ level: 'error', service: SERVICE, message: 'List posts failed', requestId, errMsg: String(err) });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const token = getTokenFromRequest(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const body = await req.json();
    const { title = 'Untitled', content = '', excerpt, cover_image_url, content_type = 'article',
      status = 'draft', scheduled_at, tags = [], seo_title, seo_description, meta_keywords = [],
      og_image_url } = body;

    const supabase = getSupabaseClient();
    const creatorId = await getCreatorId(supabase, session.userId);
    if (!creatorId) return NextResponse.json({ error: 'CREATOR_NOT_FOUND' }, { status: 404 });

    const wordCount = countWords(content);
    const readTime = Math.max(1, Math.ceil(wordCount / 200));
    const slug = slugify(title);
    const now = new Date().toISOString();

    const { data: post, error } = await supabase.from('content_posts').insert({
      creator_id: creatorId, title, slug, content, excerpt, cover_image_url,
      content_type, status, scheduled_at: scheduled_at || null,
      published_at: status === 'published' ? now : null,
      tags, seo_title, seo_description, meta_keywords, og_image_url,
      word_count: wordCount, read_time_mins: readTime, version: 1,
    }).select().single();

    if (error) throw error;

    // Save initial version
    await supabase.from('content_versions').insert({
      post_id: post.id, version: 1, title, content, excerpt,
      changed_by: session.userId, change_note: 'Initial version',
      snapshot: { title, content, excerpt, tags, status },
    });

    log({ level: 'info', service: SERVICE, message: 'Post created', requestId, postId: post.id });
    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    log({ level: 'error', service: SERVICE, message: 'Create post failed', requestId, errMsg: String(err) });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
