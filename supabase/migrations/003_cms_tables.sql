-- ══════════════════════════════════════════════════════════════════════
-- Migration 003: CMS tables
-- content_posts, content_versions, media_assets
-- Already applied to Supabase via MCP connector (March 2026).
-- This file documents the schema for version control / CI migrations.
-- ══════════════════════════════════════════════════════════════════════

-- ── content_posts ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_posts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id       UUID        REFERENCES public.creators(id) ON DELETE CASCADE,
  title            TEXT        NOT NULL DEFAULT '',
  slug             TEXT        NOT NULL DEFAULT '',
  content          TEXT        NOT NULL DEFAULT '',
  excerpt          TEXT,
  cover_image_url  TEXT,
  content_type     TEXT        NOT NULL DEFAULT 'article'
                               CHECK (content_type IN ('article','video','course','template','ebook')),
  status           TEXT        NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft','published','scheduled','archived')),
  scheduled_at     TIMESTAMPTZ,
  published_at     TIMESTAMPTZ,
  tags             TEXT[]      DEFAULT '{}',
  seo_title        TEXT,
  seo_description  TEXT,
  meta_keywords    TEXT[]      DEFAULT '{}',
  og_image_url     TEXT,
  version          INTEGER     NOT NULL DEFAULT 1,
  word_count       INTEGER     NOT NULL DEFAULT 0,
  read_time_mins   INTEGER     NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_posts_creator_slug_unique UNIQUE (creator_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_content_posts_creator_id ON public.content_posts(creator_id);
CREATE INDEX IF NOT EXISTS idx_content_posts_status     ON public.content_posts(status);
CREATE INDEX IF NOT EXISTS idx_content_posts_slug       ON public.content_posts(slug);

CREATE TRIGGER content_posts_updated_at
  BEFORE UPDATE ON public.content_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_posts_select_published" ON public.content_posts
  FOR SELECT USING (status = 'published');

CREATE POLICY "content_posts_creator_all" ON public.content_posts
  FOR ALL TO authenticated
  USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()))
  WITH CHECK (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()));

-- ── content_versions (ON DELETE CASCADE so versions are cleaned up with post) ──
CREATE TABLE IF NOT EXISTS public.content_versions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID        NOT NULL REFERENCES public.content_posts(id) ON DELETE CASCADE,
  version     INTEGER     NOT NULL,
  title       TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  excerpt     TEXT,
  changed_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  change_note TEXT,
  snapshot    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT content_versions_post_version_unique UNIQUE (post_id, version)
);

CREATE INDEX IF NOT EXISTS idx_content_versions_post_id ON public.content_versions(post_id);
CREATE INDEX IF NOT EXISTS idx_content_versions_created ON public.content_versions(post_id, created_at DESC);

ALTER TABLE public.content_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_versions_creator_read" ON public.content_versions
  FOR SELECT TO authenticated
  USING (post_id IN (
    SELECT cp.id FROM public.content_posts cp
    JOIN public.creators c ON c.id = cp.creator_id
    WHERE c.user_id = auth.uid()
  ));

CREATE POLICY "content_versions_creator_insert" ON public.content_versions
  FOR INSERT TO authenticated
  WITH CHECK (post_id IN (
    SELECT cp.id FROM public.content_posts cp
    JOIN public.creators c ON c.id = cp.creator_id
    WHERE c.user_id = auth.uid()
  ));

-- ── media_assets ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_assets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    UUID        REFERENCES public.creators(id) ON DELETE CASCADE,
  storage_path  TEXT        NOT NULL,
  public_url    TEXT        NOT NULL,
  original_name TEXT        NOT NULL,
  mime_type     TEXT        NOT NULL,
  size_bytes    BIGINT      NOT NULL DEFAULT 0,
  width         INTEGER,
  height        INTEGER,
  alt_text      TEXT,
  tags          TEXT[]      DEFAULT '{}',
  bucket        TEXT        NOT NULL DEFAULT 'cms-media',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_creator_id  ON public.media_assets(creator_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_mime_type   ON public.media_assets(mime_type);

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_assets_creator_all" ON public.media_assets
  FOR ALL TO authenticated
  USING (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()))
  WITH CHECK (creator_id IN (SELECT id FROM public.creators WHERE user_id = auth.uid()));
