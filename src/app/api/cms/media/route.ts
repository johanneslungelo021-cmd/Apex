export const runtime = 'nodejs';
/**
 * CMS Media Upload API
 *
 * Fixes:
 *   - getCreatorId uses .maybeSingle() — no 500 on "not found"
 *   - ext derived from MIME allowlist (not filename) — no path traversal
 *   - storagePath URL-encoded before use in fetch URL
 *   - Upload fetch uses fetchWithTimeout (60 s) — no indefinite hang
 *   - DB insert failure triggers best-effort storage blob cleanup
 *   - base64 fallback removed — storage failure returns 502 cleanly
 */
import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { log, generateRequestId, fetchWithTimeout } from '@/lib/api-utils';
import { getTokenFromRequest, verifySession } from '@/lib/auth/session';
import crypto from 'crypto';

const SERVICE     = 'cms-media';
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const MAX_SIZE     = 50 * 1024 * 1024; // 50 MB
const UPLOAD_TIMEOUT_MS = 60_000;

// FIX: allowlist maps MIME → safe alphanumeric ext (no user filename trust)
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg':       'jpg',
  'image/png':        'png',
  'image/webp':       'webp',
  'image/gif':        'gif',
  'image/svg+xml':    'svg',
  'video/mp4':        'mp4',
  'video/webm':       'webm',
  'application/pdf':  'pdf',
};

async function getCreatorId(supabase: ReturnType<typeof getSupabaseClient>, userId: string): Promise<string | null> {
  // FIX: maybeSingle() returns { data: null, error: null } for zero rows instead of throwing
  const { data, error } = await supabase.from('creators').select('id').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`getCreatorId DB error: ${error.message} (code: ${error.code})`);
  return data?.id ?? null;
}

export async function GET(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const token   = getTokenFromRequest(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const url  = new URL(req.url);
  const type = url.searchParams.get('type');
  const rawPage = parseInt(url.searchParams.get('page') || '1', 10);
  const page    = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const limit   = 40;
  const offset  = (page - 1) * limit;

  try {
    const supabase  = getSupabaseClient();
    const creatorId = await getCreatorId(supabase, session.userId);
    if (!creatorId) return NextResponse.json({ error: 'CREATOR_NOT_FOUND' }, { status: 404 });

    let query = supabase.from('media_assets')
      .select('*', { count: 'exact' })
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type === 'image') query = query.like('mime_type', 'image/%');
    else if (type === 'video') query = query.like('mime_type', 'video/%');
    else if (type === 'pdf')   query = query.eq('mime_type', 'application/pdf');

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
  const token   = getTokenFromRequest(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'NO_FILE' }, { status: 400 });

    // FIX: derive ext from MIME allowlist — never trust file.name
    const safeExt = MIME_TO_EXT[file.type];
    if (!safeExt) return NextResponse.json({ error: 'INVALID_TYPE', message: 'File type not allowed' }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'FILE_TOO_LARGE', message: 'Max 50 MB' }, { status: 400 });

    const supabase  = getSupabaseClient();
    const creatorId = await getCreatorId(supabase, session.userId);
    if (!creatorId) return NextResponse.json({ error: 'CREATOR_NOT_FOUND' }, { status: 404 });

    // FIX: storagePath uses safe ext only, no user-controlled characters
    const storagePath = `${creatorId}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${safeExt}`;
    const bucket      = 'cms-media';
    const arrayBuffer = await file.arrayBuffer();

    // FIX: fetchWithTimeout (60 s) — upload can't hang indefinitely
    const uploadRes = await fetchWithTimeout(
      `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURIComponent(storagePath)}`,
      {
        method:  'POST',
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY ?? ''}`,
          'Content-Type': file.type,
          'x-upsert':     'false',
        },
        body: arrayBuffer,
      },
      UPLOAD_TIMEOUT_MS,
    );

    if (!uploadRes.ok) {
      // FIX: no base64 fallback — fail cleanly with 502
      const errText = await uploadRes.text();
      log({ level: 'error', service: SERVICE, requestId,
        message: 'Supabase Storage upload failed',
        httpStatus: uploadRes.status, storageError: errText });
      return NextResponse.json(
        { error: 'STORAGE_UPLOAD_FAILED', message: 'File upload failed. Check that Supabase Storage bucket "cms-media" exists.' },
        { status: 502 },
      );
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeURIComponent(storagePath)}`;

    const { data: asset, error: dbErr } = await supabase.from('media_assets').insert({
      creator_id:    creatorId,
      storage_path:  storagePath,
      public_url:    publicUrl,
      original_name: file.name,
      mime_type:     file.type,
      size_bytes:    file.size,
      bucket,
    }).select().single();

    if (dbErr) {
      // FIX: best-effort cleanup of uploaded blob before rethrowing DB error
      try {
        await supabase.storage.from(bucket).remove([storagePath]);
      } catch (cleanupErr) {
        log({ level: 'warn', service: SERVICE, requestId,
          message: 'Storage cleanup after DB failure also failed', errMsg: String(cleanupErr) });
      }
      throw dbErr;
    }

    log({ level: 'info', service: SERVICE, message: 'Media uploaded', requestId, assetId: asset.id });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (err) {
    log({ level: 'error', service: SERVICE, message: 'Upload failed', requestId, errMsg: String(err) });
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
