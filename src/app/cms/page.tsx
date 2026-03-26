"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import NextImage from "next/image";
import {
  FileText,
  Plus,
  Search,
  Trash2,
  CheckCircle,
  Archive,
  Calendar,
  Edit2,
} from "lucide-react";

interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  content_type: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  tags: string[];
  word_count: number;
  read_time_mins: number;
  created_at: string;
  updated_at: string;
  version: number;
}

const STATUS_CONFIG = {
  draft: {
    icon: FileText,
    color: "text-zinc-400",
    bg: "bg-zinc-800",
    label: "Draft",
  },
  published: {
    icon: CheckCircle,
    color: "text-emerald-400",
    bg: "bg-emerald-900/30",
    label: "Published",
  },
  scheduled: {
    icon: Calendar,
    color: "text-blue-400",
    bg: "bg-blue-900/30",
    label: "Scheduled",
  },
  archived: {
    icon: Archive,
    color: "text-zinc-500",
    bg: "bg-zinc-900",
    label: "Archived",
  },
};

export default function CMSPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0); // FIX: tracks actual server total, not local length
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<string | null>(null);
  // FIX: track fetch errors separately from "no posts" state
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setFetchError(null); // FIX: clear previous error on new fetch
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/cms/posts?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`); // FIX: check res.ok before parsing
      const data = await res.json();
      setPosts(data.posts ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      // FIX: don't collapse failures into empty state — show error UI
      setFetchError(String(err));
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const deletePost = async (id: string) => {
    if (!confirm("Delete this post? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/cms/posts/${id}`, { method: "DELETE" });
      if (!res.ok) return; // silently no-op on error — do not mutate UI state
      const newPosts = posts.filter((x) => x.id !== id);
      setPosts(newPosts);
      setTotal((t) => Math.max(0, t - 1));
      // FIX: if last item on page > 1 is deleted, step back to previous page
      if (newPosts.length === 0 && page > 1) {
        setPage((p) => p - 1);
      }
    } finally {
      // FIX: always clear deleting state even on network error
      setDeleting(null);
    }
  };

  const filtered = posts.filter(
    (p) =>
      search === "" ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.excerpt ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  // FIX: stats derived from server-side total + page-local status counts
  // The total for published/draft/scheduled reflects only the current page —
  // labels indicate this to avoid misleading counts under pagination
  const stats = {
    total,
    published: posts.filter((p) => p.status === "published").length,
    draft: posts.filter((p) => p.status === "draft").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Content Studio</h1>
            <p className="text-zinc-400 mt-1 text-sm">
              Manage your content, drafts, and publications
            </p>
          </div>
          <Link
            href="/cms/new"
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" /> New Post
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            {
              label: "Total Posts",
              value: stats.total,
              icon: FileText,
              color: "text-zinc-400",
            },
            {
              label: "Published (page)",
              value: stats.published,
              icon: CheckCircle,
              color: "text-emerald-400",
            },
            {
              label: "Drafts (page)",
              value: stats.draft,
              icon: FileText,
              color: "text-zinc-400",
            },
            {
              label: "Scheduled (page)",
              value: stats.scheduled,
              icon: Calendar,
              color: "text-blue-400",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500 uppercase tracking-wide">
                  {s.label}
                </span>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <div className="text-2xl font-bold text-white">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search posts..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
            {["all", "published", "draft", "scheduled", "archived"].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors ${
                  statusFilter === s
                    ? "bg-blue-600 text-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Posts Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : fetchError ? (
            // FIX: distinct error UI — not collapsed into "no posts" state
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
              <FileText className="h-12 w-12 mb-4 opacity-40 text-red-400" />
              <p className="text-lg font-medium text-red-400">
                Failed to load posts
              </p>
              <p className="text-sm mt-1 text-zinc-600">{fetchError}</p>
              <button
                onClick={() => loadPosts()}
                className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-white transition-colors"
              >
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
              <FileText className="h-12 w-12 mb-4 opacity-40" />
              <p className="text-lg font-medium text-zinc-400">No posts yet</p>
              <p className="text-sm mt-1">Create your first piece of content</p>
              <Link
                href="/cms/new"
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white transition-colors"
              >
                <Plus className="h-4 w-4" /> Create Post
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-xs font-medium text-zinc-500 px-6 py-3 uppercase tracking-wide">
                    Title
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3 uppercase tracking-wide">
                    Type
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3 uppercase tracking-wide">
                    Words
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3 uppercase tracking-wide">
                    Updated
                  </th>
                  <th className="text-right text-xs font-medium text-zinc-500 px-6 py-3 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((post) => {
                  const s =
                    STATUS_CONFIG[post.status as keyof typeof STATUS_CONFIG] ??
                    STATUS_CONFIG.draft;
                  const StatusIcon = s.icon;
                  return (
                    <tr
                      key={post.id}
                      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-3">
                          {post.cover_image_url ? (
                            // FIX: Next.js Image instead of raw <img>
                            <div className="relative w-10 h-10 rounded overflow-hidden flex-shrink-0">
                              <NextImage
                                src={post.cover_image_url}
                                alt={post.title}
                                fill
                                className="object-cover"
                                sizes="40px"
                              />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
                              <FileText className="h-4 w-4 text-zinc-600" />
                            </div>
                          )}
                          <div>
                            <Link
                              href={`/cms/${post.id}`}
                              className="text-sm font-medium text-white hover:text-blue-400 transition-colors line-clamp-1"
                            >
                              {post.title || "Untitled"}
                            </Link>
                            {post.excerpt && (
                              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
                                {post.excerpt}
                              </p>
                            )}
                            {post.tags.length > 0 && (
                              <div className="flex gap-1 mt-1">
                                {post.tags.slice(0, 3).map((t) => (
                                  <span
                                    key={t}
                                    className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${s.bg} ${s.color}`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs text-zinc-400 capitalize">
                          {post.content_type}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-xs text-zinc-400">
                          <div>{post.word_count.toLocaleString()} words</div>
                          <div className="text-zinc-600">
                            {post.read_time_mins} min read
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-xs text-zinc-500">
                          {new Date(post.updated_at).toLocaleDateString(
                            "en-ZA",
                            {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            },
                          )}
                        </div>
                        <div className="text-xs text-zinc-600">
                          v{post.version}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {/* FIX: actions always visible for keyboard users; opacity-100 on focus-within */}
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <Link
                            href={`/cms/${post.id}`}
                            aria-label={`Edit "${post.title || "Untitled"}"`}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Link>
                          <button
                            onClick={() => deletePost(post.id)}
                            disabled={deleting === post.id}
                            aria-label={`Delete "${post.title || "Untitled"}"`}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-900/20 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {total > 20 && (
          <div className="flex items-center justify-between mt-4 text-sm text-zinc-400">
            <span>
              Showing {Math.min((page - 1) * 20 + 1, total)}–
              {Math.min(page * 20, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 bg-zinc-800 rounded disabled:opacity-40 hover:bg-zinc-700 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * 20 >= total}
                className="px-3 py-1.5 bg-zinc-800 rounded disabled:opacity-40 hover:bg-zinc-700 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
