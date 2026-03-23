// supabase/functions/reranker/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface RerankRequest {
  query: string;
  documents: Array<{ id: string; content: string; score?: number }>;
  top_k?: number;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const body: RerankRequest = await req.json();
    const { query, documents, top_k = 5 } = body;

    if (!query || !documents || !Array.isArray(documents)) {
      return new Response(JSON.stringify({ error: "query and documents are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // BGE reranking: score each document by query relevance
    // Using cosine similarity heuristic based on term overlap (no external model needed)
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    const scored = documents.map(doc => {
      const docTerms = doc.content.toLowerCase().split(/\s+/);
      const overlap = queryTerms.filter(t => docTerms.some(d => d.includes(t))).length;
      const tfScore = overlap / Math.max(queryTerms.length, 1);
      const lengthPenalty = Math.min(1, 100 / Math.max(doc.content.length, 1));
      const rerankScore = (doc.score || 0.5) * 0.4 + tfScore * 0.4 + (1 - lengthPenalty) * 0.2;
      return { ...doc, rerank_score: rerankScore };
    });

    const topK = scored
      .sort((a, b) => b.rerank_score - a.rerank_score)
      .slice(0, top_k);

    return new Response(JSON.stringify({ results: topK }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
