export const runtime = 'nodejs';
/**
 * CMS Media Upload API
 * POST /api/cms/media  (multipart/form-data: file, bucket?)
 * GET  /api/cms/media?type=image&page=1
 */
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { log, generateRequestId } from '@/lib/api-utils';
import { getTokenFromRequest, verifySession } from '@/lib/auth/session';
import crypto from 'crypto';

const SERVICE = 'cms-media';
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const ALLOWED_MIME = new Set([
  'image/jpeg','image/png','image/webp','image/gif','image/svg+xml',
  'video/mp4','video/webm','application/pdf',
]);
const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

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
  const type = url.searchParams.get('type'); // 'image' | 'video' | 'pdf'
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = 40;
  const offset = (page - 1) * limit;

  try {
    const supabase = getSupabaseClient();
    const creatorId = await getCreatorId(supabase, session.userId);
    if (!creatorId) return NextResponse.json({ error: 'CREATOR_NOT_FOUND' }, { status: 404 });

    let query = supabase.from('media_assets')
      .select('*', { count: 'exact' })
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type === 'image') query = query.like('mime_type', 'image/%');
    else if (type === 'video') query = query.like('mime_type', 'video/%');
    else if (type === 'pdf') query = query.eq('mime_type', 'application/pdf');

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ assets: data, total: count, page, limit });
  } catch (err) {
    log({ level: 'error', service: SERVICE, message: 'List media failed', requestId, errMsg: String(err) });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const token = getTokenFromRequest(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'NO_FILE' }, { status: 400 });
    if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: 'INVALID_TYPE', message: 'File type not allowed' }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'FILE_TOO_LARGE', message: 'Max 50 MB' }, { status: 400 });

    const supabase = getSupabaseClient();
    const creatorId = await getCreatorId(supabase, session.userId);
    if (!creatorId) return NextResponse.json({ error: 'CREATOR_NOT_FOUND' }, { status: 404 });

    const ext = file.name.split('.').pop() ?? 'bin';
    const storagePath = `${creatorId}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const bucket = 'cms-media';

    // Upload to Supabase Storage via REST API (service role bypasses RLS)
    const arrayBuffer = await file.arrayBuffer();
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY ?? ''}`,
          'Content-Type': file.type,
          'x-upsert': 'false',
        },
        body: arrayBuffer,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      log({ level: 'error', service: SERVICE, message: 'Storage upload failed', requestId, status: uploadRes.status, err: errText });
      // Fallback: store as data URL for development when storage not configured
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const publicUrl = `data:${file.type};base64,${base64}`;

      const { data: asset, error: dbErr } = await supabase.from('media_assets').insert({
        creator_id: creatorId, storage_path: `local:${storagePath}`,
        public_url: publicUrl, original_name: file.name,
        mime_type: file.type, size_bytes: file.size, bucket: 'local',
      }).select().single();

      if (dbErr) throw dbErr;
      return NextResponse.json({ asset }, { status: 201 });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`;

    const { data: asset, error: dbErr } = await supabase.from('media_assets').insert({
      creator_id: creatorId, storage_path: storagePath, public_url: publicUrl,
      original_name: file.name, mime_type: file.type, size_bytes: file.size, bucket,
    }).select().single();

    if (dbErr) throw dbErr;

    log({ level: 'info', service: SERVICE, message: 'Media uploaded', requestId, assetId: asset.id });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (err) {
    log({ level: 'error', service: SERVICE, message: 'Upload failed', requestId, errMsg: String(err) });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
