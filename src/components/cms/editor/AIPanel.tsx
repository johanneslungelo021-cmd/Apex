'use client';
import { useState } from 'react';
import { Sparkles, Loader2, Copy, Check, X, Type, AlignLeft, Wand2, RefreshCw, Hash, Tag } from 'lucide-react';

interface AIPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string;
  onApply: (field: string, value: string) => void;
}

type AIAction = 'title' | 'excerpt' | 'content' | 'seo' | 'tags' | 'rewrite' | 'expand';

const ACTIONS: { id: AIAction; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'title',   label: 'Title',   icon: Type,       desc: 'Generate catchy titles' },
  { id: 'excerpt', label: 'Excerpt', icon: AlignLeft,  desc: 'Write a summary' },
  { id: 'content', label: 'Content', icon: Wand2,      desc: 'Generate full article' },
  { id: 'rewrite', label: 'Rewrite', icon: RefreshCw,  desc: 'Improve existing text' },
  { id: 'expand',  label: 'Expand',  icon: Sparkles,   desc: 'Add more depth' },
  { id: 'seo',     label: 'SEO',     icon: Hash,       desc: 'Optimize for search' },
  { id: 'tags',    label: 'Tags',    icon: Tag,        desc: 'Suggest relevant tags' },
];

const FIELD_MAP: Record<AIAction, string> = {
  title: 'title', excerpt: 'excerpt', content: 'content',
  seo: 'seo_title', tags: 'tags', rewrite: 'content', expand: 'content',
};

export function AIPanel({ open, onClose, title, content, onApply }: AIPanelProps) {
  const [action, setAction] = useState<AIAction>('title');
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('professional');
  const [length, setLength] = useState('medium');
  const [result, setResult] = useState('');
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cms/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: action, prompt: prompt || title, context: content.substring(0, 1000), tone, length }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data.result ?? '');
        setAlternatives(data.alternatives ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (result) { onApply(FIELD_MAP[action], result); onClose(); }
  };

  const copy = () => {
    navigator.clipboard.writeText(result);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-400" />
            <h2 className="font-semibold text-white">AI Content Assistant</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex h-[520px]">
          {/* Action list */}
          <div className="w-44 border-r border-zinc-800 p-3 flex-shrink-0">
            {ACTIONS.map(a => {
              const Icon = a.icon as React.ComponentType<{ className?: string }>;
              return (
                <button key={a.id} onClick={() => { const id = a.id as AIAction; setAction(id); }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-sm mb-1 transition-colors ${action === a.id ? 'bg-purple-500/15 text-purple-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span>{a.label}</span>
                </button>
              );
            })}
          </div>

          {/* Main area */}
          <div className="flex-1 flex flex-col p-4 overflow-y-auto">
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <label className="text-xs text-zinc-500 block mb-1">Tone</label>
                <select value={tone} onChange={e => setTone(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500">
                  {['professional','casual','friendly','formal','engaging','conversational'].map(t => (
                    <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              {['content','expand','rewrite'].includes(action) && (
                <div className="flex-1">
                  <label className="text-xs text-zinc-500 block mb-1">Length</label>
                  <select value={length} onChange={e => setLength(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500">
                    {['short','medium','long'].map(l => <option key={l} value={l} className="capitalize">{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="text-xs text-zinc-500 block mb-1">Additional context (optional)</label>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={2}
                placeholder={`Extra guidance for ${ACTIONS.find(a => a.id === action)?.label.toLowerCase()} generation...`}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 resize-none" />
            </div>

            <button onClick={generate} disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors mb-4">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? 'Generating...' : `Generate ${ACTIONS.find(a => a.id === action)?.label}`}
            </button>

            {result && (
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-zinc-500">Result</label>
                  <button onClick={copy} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors">
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <textarea value={result} onChange={e => setResult(e.target.value)} rows={5}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 resize-none" />

                {alternatives.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-zinc-500 mb-2">Alternatives</p>
                    {alternatives.map((alt, i) => (
                      <button key={i} onClick={() => setResult(alt)}
                        className="w-full text-left text-sm p-2.5 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg mb-1.5 text-zinc-300 transition-colors">
                        {alt}
                      </button>
                    ))}
                  </div>
                )}

                <button onClick={apply}
                  className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white transition-colors">
                  <Check className="h-4 w-4" /> Apply to Content
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
