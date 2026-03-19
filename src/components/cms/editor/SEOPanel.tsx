'use client';
import { useState } from 'react';
import { Globe, Search, X, Sparkles, Loader2, AlertTriangle, Check } from 'lucide-react';

interface SEOPanelProps {
  title: string; content: string;
  seoTitle: string; seoDescription: string; metaKeywords: string[];
  onChange: (updates: Record<string, unknown>) => void;
}

function getScore(seoTitle: string, seoDesc: string, content: string, keywords: string[]): { score: number; tips: string[] } {
  let score = 0;
  const tips: string[] = [];
  if (seoTitle && seoTitle.length >= 30 && seoTitle.length <= 60) score += 25;
  else tips.push(seoTitle.length < 30 ? 'SEO title is too short (aim for 30–60 chars)' : 'SEO title is too long (max 60 chars)');
  if (seoDesc && seoDesc.length >= 120 && seoDesc.length <= 160) score += 25;
  else tips.push(seoDesc.length < 120 ? 'Meta description is too short (aim for 120–160 chars)' : 'Meta description is too long (max 160 chars)');
  if (keywords.length >= 3) score += 25;
  else tips.push('Add at least 3 focus keywords');
  const wordCount = content.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;
  if (wordCount >= 300) score += 25;
  else tips.push(`Content too short (${wordCount} words — aim for 300+)`);
  return { score, tips };
}

export function SEOPanel({ title, content, seoTitle, seoDescription, metaKeywords, onChange }: SEOPanelProps) {
  const [kwInput, setKwInput]     = useState('');
  const [generating, setGenerating] = useState(false);
  const { score, tips } = getScore(seoTitle, seoDescription, content, metaKeywords);

  const addKeyword = () => {
    const kw = kwInput.trim();
    if (kw && !metaKeywords.includes(kw)) {
      onChange({ meta_keywords: [...metaKeywords, kw] });
      setKwInput('');
    }
  };

  const generateSEO = async () => {
    if (!title && !content) return;
    setGenerating(true);
    try {
      // FIX: check res.ok for each request independently — only apply fields that succeeded
      const [titleRes, descRes] = await Promise.all([
        fetch('/api/cms/ai-generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'seo', prompt: title, context: content.substring(0, 500) }),
        }),
        fetch('/api/cms/ai-generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'excerpt', prompt: title, context: content.substring(0, 500) }),
        }),
      ]);

      const updates: Record<string, unknown> = {};

      if (titleRes.ok) {
        const titleData = await titleRes.json();
        if (titleData.result) updates.seo_title = titleData.result.substring(0, 60);
      }
      if (descRes.ok) {
        const descData = await descRes.json();
        if (descData.result) updates.seo_description = descData.result.substring(0, 160);
      }

      if (Object.keys(updates).length > 0) onChange(updates);
    } finally {
      setGenerating(false);
    }
  };

  const scoreColor    = score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400';
  const scoreBarColor = score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="space-y-6">
      {/* Score */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-medium text-white">SEO Score</span>
          </div>
          <span className={`text-2xl font-bold ${scoreColor}`}>{score}</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${scoreBarColor}`} style={{ width: `${score}%` }} />
        </div>
        {tips.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {tips.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0 mt-0.5" />
                {t}
              </li>
            ))}
          </ul>
        )}
        {score === 100 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
            <Check className="h-3.5 w-3.5" />All SEO checks passed!
          </p>
        )}
      </div>

      <button onClick={generateSEO} disabled={generating || (!title && !content)}
        className="w-full flex items-center justify-center gap-2 py-2.5 border border-zinc-700 hover:border-blue-500 hover:text-blue-400 rounded-lg text-sm text-zinc-400 transition-colors disabled:opacity-50">
        {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        Auto-generate SEO from Content
      </button>

      {/* SEO Title */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm text-zinc-300">SEO Title</label>
          <span className={`text-xs ${seoTitle.length > 60 ? 'text-red-400' : 'text-zinc-500'}`}>{seoTitle.length}/60</span>
        </div>
        <input value={seoTitle} onChange={e => onChange({ seo_title: e.target.value })}
          placeholder="Optimized title for search engines" maxLength={80}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500" />
      </div>

      {/* Meta Description */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm text-zinc-300">Meta Description</label>
          <span className={`text-xs ${seoDescription.length > 160 ? 'text-red-400' : 'text-zinc-500'}`}>{seoDescription.length}/160</span>
        </div>
        <textarea value={seoDescription} onChange={e => onChange({ seo_description: e.target.value })}
          placeholder="Brief description for search results" rows={3} maxLength={200}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 resize-none" />
      </div>

      {/* Keywords */}
      <div>
        <label className="text-sm text-zinc-300 block mb-1.5">Focus Keywords</label>
        <div className="flex gap-2 mb-2">
          <input value={kwInput} onChange={e => setKwInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
            placeholder="Type keyword and press Enter"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500" />
          <button onClick={addKeyword}
            className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-white transition-colors">
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {metaKeywords.map(kw => (
            <span key={kw} className="flex items-center gap-1 text-xs px-2.5 py-1 bg-blue-900/30 text-blue-300 border border-blue-800/50 rounded-full">
              {kw}
              <button onClick={() => onChange({ meta_keywords: metaKeywords.filter(k => k !== kw) })}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* OG Preview */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-4 w-4 text-zinc-400" />
          <label className="text-sm text-zinc-300">Search Preview</label>
        </div>
        <div className="p-4 bg-white rounded-lg">
          <div className="text-xs text-emerald-700 mb-1">apex-central.vercel.app</div>
          <div className="text-blue-700 text-base font-medium leading-snug line-clamp-1 mb-1">
            {seoTitle || title || 'Page Title'}
          </div>
          <div className="text-gray-500 text-sm line-clamp-2">
            {seoDescription || 'Page description will appear here in search results.'}
          </div>
        </div>
      </div>
    </div>
  );
}
