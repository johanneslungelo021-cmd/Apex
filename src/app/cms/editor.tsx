'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Save, ArrowLeft, Sparkles, Clock, Eye, Settings, History,
  Globe, FileText, Image as ImageIcon, Calendar, ChevronDown,
  Check, Loader2, X, Upload, Tag, Hash
} from 'lucide-react';
import { AIPanel } from '@/components/cms/editor/AIPanel';
import { SEOPanel } from '@/components/cms/editor/SEOPanel';
import { VersionHistory } from '@/components/cms/editor/VersionHistory';

// Dynamic import to prevent SSR issues with TipTap
const RichTextEditor = dynamic(
  () => import('@/components/cms/editor/RichTextEditor').then(m => ({ default: m.RichTextEditor })),
  { ssr: false, loading: () => <div className="h-96 bg-zinc-900 rounded-xl animate-pulse" /> }
);

interface PostData {
  id?: string; title: string; slug: string; content: string; excerpt: string;
  cover_image_url: string; content_type: string; status: string; scheduled_at: string;
  tags: string[]; seo_title: string; seo_description: string; meta_keywords: string[];
  og_image_url: string; version: number; word_count: number; read_time_mins: number;
}

const DEFAULT_POST: PostData = {
  title: '', slug: '', content: '', excerpt: '', cover_image_url: '',
  content_type: 'article', status: 'draft', scheduled_at: '', tags: [],
  seo_title: '', seo_description: '', meta_keywords: [], og_image_url: '',
  version: 1, word_count: 0, read_time_mins: 1,
};

type SidebarTab = 'settings' | 'seo' | 'media';

export default function ContentEditor() {
  const params = useParams();
  const router = useRouter();
  const postId = params?.id as string | undefined;
  const isNew = !postId;

  const [post, setPost] = useState<PostData>(DEFAULT_POST);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saved, setSaved] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('settings');
  const [showAI, setShowAI] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load existing post
  useEffect(() => {
    if (!postId) return;
    fetch(`/api/cms/posts/${postId}`)
      .then(r => r.json())
      .then(d => { if (d.post) setPost({ ...DEFAULT_POST, ...d.post }); })
      .finally(() => setLoading(false));
  }, [postId]);

  // Auto-save draft
  const autoSave = useCallback(() => {
    if (!post.title && !post.content) return;
    clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => save(true), 3000);
  }, [post]);

  useEffect(() => { autoSave(); return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); }; }, [autoSave]);

  const update = useCallback((updates: Partial<PostData> | Record<string, unknown>) => {
    setPost(p => ({ ...p, ...updates }));
  }, []);

  const save = async (isAutoSave = false) => {
    if (!post.title && !post.content && isAutoSave) return;
    setSaving(true);
    try {
      const payload = {
        title: post.title || 'Untitled',
        content: post.content,
        excerpt: post.excerpt,
        cover_image_url: post.cover_image_url,
        content_type: post.content_type,
        status: post.status,
        scheduled_at: post.scheduled_at || null,
        tags: post.tags,
        seo_title: post.seo_title,
        seo_description: post.seo_description,
        meta_keywords: post.meta_keywords,
        og_image_url: post.og_image_url,
        change_note: isAutoSave ? 'Auto-save' : 'Manual save',
      };

      let res: Response;
      if (isNew) {
        res = await fetch('/api/cms/posts', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          router.replace(`/cms/${data.post.id}`);
          setPost(p => ({ ...p, ...data.post }));
        }
      } else {
        res = await fetch(`/api/cms/posts/${postId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          setPost(p => ({ ...p, version: data.post.version }));
        }
      }

      if (!isAutoSave) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    } finally { setSaving(false); }
  };

  const publish = async () => {
    update({ status: 'published' });
    await save();
  };

  const uploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/cms/media', { method: 'POST', body: fd });
      if (res.ok) { const data = await res.json(); update({ cover_image_url: data.asset.public_url }); }
    } finally { setUploadingCover(false); e.target.value = ''; }
  };

  const uploadImage = async (file: File): Promise<string> => {
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/cms/media', { method: 'POST', body: fd });
    if (res.ok) { const data = await res.json(); return data.asset.public_url; }
    throw new Error('Upload failed');
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !post.tags.includes(t)) { update({ tags: [...post.tags, t] }); }
    setTagInput('');
  };

  const handleRollback = async (version: number) => {
    if (!postId) return;
    const res = await fetch(`/api/cms/posts/${postId}?versions=true`);
    const data = await res.json();
    const v = data.versions?.find((x: { version: number; title: string; content: string; excerpt: string }) => x.version === version);
    if (v) {
      update({ title: v.title, content: v.content, excerpt: v.excerpt });
      setShowVersions(false);
    }
  };

  const applyAI = (field: string, value: string) => {
    if (field === 'tags') {
      const newTags = value.split(',').map((t: string) => t.trim()).filter(Boolean);
      update({ tags: [...new Set([...post.tags, ...newTags])] });
    } else {
      update({ [field]: value });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const wordCount = post.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">

      {/* Top Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-zinc-900/95 backdrop-blur border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/cms')} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-500">Content Studio</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-300 max-w-48 truncate">{post.title || 'Untitled'}</span>
          </div>
          <span className="text-xs text-zinc-600">v{post.version}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 mr-2">
            <Clock className="h-3.5 w-3.5" />
            {wordCount.toLocaleString()} words · {Math.max(1, Math.ceil(wordCount / 200))} min read
          </div>

          <button onClick={() => setShowVersions(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
            <History className="h-3.5 w-3.5" /> History
          </button>

          <button onClick={() => setShowAI(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-purple-400 hover:text-purple-300 bg-purple-900/20 hover:bg-purple-900/30 border border-purple-800/40 rounded-lg transition-colors">
            <Sparkles className="h-3.5 w-3.5" /> AI Assist
          </button>

          <button onClick={() => save()} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors disabled:opacity-60">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Save className="h-3.5 w-3.5" />}
            {saved ? 'Saved!' : 'Save'}
          </button>

          {post.status !== 'published' && (
            <button onClick={publish} disabled={saving || !post.title}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-60">
              <Globe className="h-3.5 w-3.5" /> Publish
            </button>
          )}

          {post.status === 'published' && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-800/40 rounded-lg">
              <Check className="h-3.5 w-3.5" /> Published
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Main Editor Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-8">

            {/* Cover Image */}
            {post.cover_image_url ? (
              <div className="relative mb-6 rounded-2xl overflow-hidden">
                <img src={post.cover_image_url} alt="Cover" className="w-full h-56 object-cover" />
                <button onClick={() => update({ cover_image_url: '' })}
                  className="absolute top-3 right-3 p-1.5 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center w-full h-32 mb-6 border-2 border-dashed border-zinc-800 rounded-2xl cursor-pointer hover:border-zinc-600 transition-colors group">
                <div className="text-center">
                  {uploadingCover ? (
                    <Loader2 className="h-6 w-6 animate-spin text-zinc-400 mx-auto mb-2" />
                  ) : (
                    <Upload className="h-6 w-6 text-zinc-600 group-hover:text-zinc-400 mx-auto mb-2 transition-colors" />
                  )}
                  <span className="text-sm text-zinc-600 group-hover:text-zinc-400 transition-colors">
                    {uploadingCover ? 'Uploading...' : 'Add cover image'}
                  </span>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={uploadCover} />
              </label>
            )}

            {/* Title */}
            <input
              value={post.title}
              onChange={e => update({ title: e.target.value })}
              placeholder="Untitled post..."
              className="w-full text-4xl font-bold text-white bg-transparent border-none outline-none placeholder:text-zinc-700 mb-4 leading-tight"
            />

            {/* Excerpt */}
            <textarea
              value={post.excerpt}
              onChange={e => update({ excerpt: e.target.value })}
              placeholder="Write a short excerpt (optional — used in listings and SEO)..."
              rows={2}
              className="w-full text-lg text-zinc-400 bg-transparent border-none outline-none placeholder:text-zinc-700 mb-6 resize-none leading-relaxed"
            />

            {/* Divider */}
            <div className="h-px bg-zinc-800 mb-6" />

            {/* Rich Text Editor */}
            <RichTextEditor
              content={post.content}
              onChange={c => update({ content: c })}
              onImageUpload={uploadImage}
            />
          </div>
        </main>

        {/* Right Sidebar */}
        <aside className="w-72 flex-shrink-0 border-l border-zinc-800 bg-zinc-900/50 overflow-y-auto">
          {/* Sidebar Tabs */}
          <div className="flex border-b border-zinc-800">
            {[
              { id: 'settings', icon: Settings, label: 'Settings' },
              { id: 'seo', icon: Hash, label: 'SEO' },
              { id: 'media', icon: ImageIcon, label: 'Media' },
            ].map(t => (
              <button key={t.id} onClick={() => setSidebarTab(t.id as SidebarTab)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${sidebarTab === t.id ? 'text-blue-400 border-b-2 border-blue-500 -mb-px' : 'text-zinc-500 hover:text-zinc-300'}`}>
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* Settings Panel */}
            {sidebarTab === 'settings' && (
              <div className="space-y-5">
                {/* Status */}
                <div>
                  <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-2">Status</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {['draft','published','scheduled','archived'].map(s => (
                      <button key={s} onClick={() => update({ status: s })}
                        className={`py-2 rounded-lg text-xs font-medium capitalize transition-colors ${post.status === s ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Schedule */}
                {post.status === 'scheduled' && (
                  <div>
                    <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-2">Schedule Date & Time</label>
                    <input type="datetime-local" value={post.scheduled_at}
                      onChange={e => update({ scheduled_at: e.target.value })}
                      min={new Date().toISOString().slice(0, 16)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                  </div>
                )}

                {/* Content Type */}
                <div>
                  <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-2">Content Type</label>
                  <select value={post.content_type} onChange={e => update({ content_type: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                    {['article','video','course','template','ebook'].map(t => (
                      <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </div>

                {/* Tags */}
                <div>
                  <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-2">Tags</label>
                  <div className="flex gap-2 mb-2">
                    <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      placeholder="Add tag..."
                      className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500" />
                    <button onClick={addTag} className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm text-white transition-colors flex-shrink-0">
                      <Tag className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {post.tags.map(t => (
                      <span key={t} className="flex items-center gap-1 text-xs px-2 py-1 bg-zinc-800 text-zinc-300 rounded-full">
                        {t}
                        <button onClick={() => update({ tags: post.tags.filter(x => x !== t) })} className="text-zinc-500 hover:text-zinc-300">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Slug */}
                <div>
                  <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-2">URL Slug</label>
                  <input value={post.slug} onChange={e => update({ slug: e.target.value })}
                    placeholder="auto-generated-slug"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-400 focus:outline-none focus:border-blue-500 font-mono" />
                </div>

                {/* Stats */}
                {post.id && (
                  <div className="p-3 bg-zinc-800/50 rounded-xl border border-zinc-800">
                    <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wide">Statistics</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-zinc-400 block">{wordCount.toLocaleString()}</span><span className="text-zinc-600">words</span></div>
                      <div><span className="text-zinc-400 block">{Math.max(1, Math.ceil(wordCount/200))} min</span><span className="text-zinc-600">read time</span></div>
                      <div><span className="text-zinc-400 block">v{post.version}</span><span className="text-zinc-600">version</span></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SEO Panel */}
            {sidebarTab === 'seo' && (
              <SEOPanel
                title={post.title} content={post.content}
                seoTitle={post.seo_title} seoDescription={post.seo_description}
                metaKeywords={post.meta_keywords}
                onChange={update}
              />
            )}

            {/* Media Panel */}
            {sidebarTab === 'media' && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-2">Cover Image URL</label>
                  <input value={post.cover_image_url} onChange={e => update({ cover_image_url: e.target.value })}
                    placeholder="https://..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-2">OG Image URL</label>
                  <input value={post.og_image_url} onChange={e => update({ og_image_url: e.target.value })}
                    placeholder="https://... (social share image)"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500" />
                  <p className="text-xs text-zinc-600 mt-1">Shown when content is shared on social media</p>
                </div>
                <div className="pt-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-2">Upload to Library</label>
                  <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-zinc-700 rounded-xl cursor-pointer hover:border-zinc-500 transition-colors">
                    <Upload className="h-5 w-5 text-zinc-600 mb-1" />
                    <span className="text-xs text-zinc-600">Click to upload</span>
                    <input type="file" accept="image/*,video/*,application/pdf" className="hidden"
                      onChange={async e => {
                        const file = e.target.files?.[0]; if (!file) return;
                        try { const url = await uploadImage(file); update({ cover_image_url: url }); } catch {}
                        e.target.value = '';
                      }} />
                  </label>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Modals */}
      <AIPanel open={showAI} onClose={() => setShowAI(false)} title={post.title} content={post.content} onApply={applyAI} />
      {showVersions && post.id && (
        <VersionHistory postId={post.id} currentVersion={post.version} onRollback={handleRollback} onClose={() => setShowVersions(false)} />
      )}
    </div>
  );
}
