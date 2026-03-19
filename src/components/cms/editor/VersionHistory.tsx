'use client';
import { useState, useEffect } from 'react';
import { History, RotateCcw, ChevronRight, Clock, X } from 'lucide-react';

interface Version {
  id: string; version: number; title: string;
  change_note: string | null; created_at: string;
}

interface VersionHistoryProps {
  postId: string; currentVersion: number;
  onRollback: (version: number) => void; onClose: () => void;
}

export function VersionHistory({ postId, currentVersion, onRollback, onClose }: VersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolling, setRolling] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/cms/posts/${postId}?versions=true`)
      .then(r => r.json())
      .then(d => setVersions(d.versions ?? []))
      .finally(() => setLoading(false));
  }, [postId]);

  const handleRollback = async (version: number) => {
    if (!confirm(`Roll back to version ${version}? Current changes will become a new version.`)) return;
    setRolling(version);
    try { await onRollback(version); }
    finally { setRolling(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-400" />
            <h2 className="font-semibold text-white">Version History</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-96">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <History className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p>No version history yet</p>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {versions.map(v => (
                <div key={v.id} className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${v.version === currentVersion ? 'border-blue-600/50 bg-blue-900/10' : 'border-zinc-800 bg-zinc-800/30 hover:border-zinc-700'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${v.version === currentVersion ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-300'}`}>
                      v{v.version}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white line-clamp-1">{v.title || 'Untitled'}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{v.change_note || `Version ${v.version}`}</p>
                      <div className="flex items-center gap-1 mt-1 text-xs text-zinc-600">
                        <Clock className="h-3 w-3" />
                        {new Date(v.created_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                  {v.version === currentVersion ? (
                    <span className="text-xs text-blue-400 font-medium px-2.5 py-1 bg-blue-900/20 rounded-full border border-blue-800/50">Current</span>
                  ) : (
                    <button onClick={() => handleRollback(v.version)} disabled={rolling === v.version}
                      className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50">
                      {rolling === v.version ? (
                        <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Restore
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-zinc-800 text-xs text-zinc-600 text-center">
          Versions are saved automatically on every save
        </div>
      </div>
    </div>
  );
}
