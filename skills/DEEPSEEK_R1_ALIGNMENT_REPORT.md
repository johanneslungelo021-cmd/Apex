# DeepSeek R1 — Alignment Verification Report
**Date**: 2026-03-25
**Model**: deepseek-r1 (Ollama API returned 401 — analysis performed by Claude as fallback per protocol)
**Workflow ID**: guwYK50fl7TKwO8V
**Workflow File**: `n8n_rag_pipeline_kimi_final.json`

---

## Alignment Score

**62/100**

The 13-node architecture is structurally correct — all 13 nodes exist in the correct order with proper connections. The core pipeline flow (Webhook → PII → Sig → Memory → Router → Reranker → Filter → LLM → Eval → Trace → Memory Store → Response → HTTP) matches the original design exactly. However, critical internal logic within several nodes diverges from the plan, and 3 out of 6 originally-identified missing components remain unimplemented.

**Breakdown:**
- Node structure & flow: 13/13 nodes present, correct wiring → +25 pts
- API endpoints: `/api/generate` (correct), Supabase Edge Function reranker (correct) → +10 pts
- Model routing: 8 routes + fallback, correct model-to-task mapping → +10 pts
- PII Filter: 10 patterns (exceeds original 9) → +5 pts
- Trace Logger: Correct schema INSERT into `ai_traces` → +5 pts
- Memory Store: Writes to `agent_memory` but missing embedding vector → +3 pts
- Memory Retrieval: Calls `get_similar_memories` RPC (correct) → +4 pts
- Eval Gate: WRONG — uses hardcoded defaults, not cosine similarity → 0 pts
- Reranker: Term-overlap heuristic instead of BAAI/bge-reranker-v2-m3 → 0 pts
- Missing: agent_feedback, fallback cascade, deterministic eval → 0 pts

---

## Critical Gaps

### 1. Eval Gate is NOT deterministic cosine similarity (CRITICAL)
The current Eval Gate node defaults `faithfulness` to 0.8 and `relevance` to 0.7 when scores aren't present in the LLM response — which they never will be, because Ollama's `/api/generate` endpoint returns `{ response: "..." }` with no scoring metadata. This means **every single request passes the eval gate with fake scores**. The gate is decorative, not functional.

The original design specifies: compute cosine similarity between the query embedding and the response embedding, with a threshold of 0.72. This requires generating an embedding of the LLM response and comparing it to the query embedding.

### 2. Memory Store does NOT write embedding vectors (CRITICAL)
The Memory Store node POSTs to `agent_memory` with `{ type, content, score }` but does NOT include an `embedding` field. The `agent_memory` table has an `embedding vector(768)` column, and `get_similar_memories` filters on `embedding IS NOT NULL`. This means:
- Memories are stored without embeddings
- `get_similar_memories` will NEVER return them
- The entire memory loop is broken — the pipeline cannot learn from past interactions

### 3. agent_feedback table + update_win_streak trigger (MISSING)
The 7th component from the original plan — a feedback collection system with an `agent_feedback` table and an `update_win_streak` trigger — was never created. This prevents the system from tracking agent performance over time and implementing win-streak-based confidence adjustments.

### 4. Confidence-based model fallback cascade (MISSING)
The original plan specified: if the primary model returns low confidence, cascade to the next model (qwen → kimi → glm → deepseek). The current implementation uses a single LLM Call node with no retry or fallback logic. If the selected model fails or returns a poor response, the pipeline has no recovery mechanism.

### 5. Supabase migrations 011-014 not applied (BLOCKED)
These migrations (including the critical `014_rag_pipeline.sql` that creates `ai_traces`, `agent_memory`, `get_similar_memories` RPC, and pgvector extension) could not be auto-applied due to an invalid `SUPABASE_ACCESS_TOKEN` GitHub secret. If these tables don't exist in production, the entire pipeline will fail on every request.

---

## Drift Issues

### 1. Eval Gate: Hardcoded scores vs cosine similarity
- **Original design**: Compute embedding of LLM response, calculate cosine similarity against query embedding, threshold at 0.72
- **What was built**: Check if `faithfulness_score` and `relevance_score` exist in LLM response (they don't), default to 0.8/0.7 (always passes)
- **Impact**: Zero quality control on LLM outputs. Every response is treated as high-quality regardless of actual content.

### 2. Reranker: Term-overlap heuristic vs BAAI/bge-reranker-v2-m3
- **Original design**: Use BAAI/bge-reranker-v2-m3 transformer model for semantic reranking
- **What was built**: Simple term-overlap scoring: count how many query terms appear in the document, weighted with original score and length penalty
- **Impact**: Term overlap cannot capture semantic similarity. "automobile accident" would score 0 against "car crash" despite being semantically identical. For a RAG pipeline, this means retrieved memories may be poorly ranked.

### 3. Memory Retrieval: match_threshold parameter
- **Original design**: `get_similar_memories(query_embedding, match_count)` — two parameters
- **What was built**: The node passes `match_threshold: 0.5` as a third parameter that the RPC function doesn't accept (function signature is `query_embedding vector(768), match_count INT`)
- **Impact**: Supabase will likely ignore the extra parameter or error. Minor issue but indicates the node wasn't tested end-to-end.

### 4. Model Router: 8 routes vs 5 routes
- **Original design**: 5 routes (review/security, decision/plan, code/fix, financial/payment, default)
- **What was built**: 8 explicit routes + 1 fallback (review, security, decision, plan, code, fix, financial, payment, default)
- **Impact**: Functionally equivalent — the original paired routes are just split into individual routes. All routes converge to the same Reranker node. This is acceptable drift, not a bug.

### 5. LLM Call: No temperature control per model
- **Original design**: Model-specific prompts with appropriate temperatures (the "Prepare Prompts" node was supposed to set per-model temperatures)
- **What was built**: The LLM Call node doesn't pass a `temperature` parameter at all in the Ollama payload. The `options` field with temperature is absent from the jsonBody.
- **Impact**: All models run at Ollama's default temperature, which may be too high for security reviews (should be 0.1) or too low for creative tasks.

---

## Reranker Assessment

**NOT acceptable for production.**

The current term-overlap reranker has fundamental limitations:

1. **No semantic understanding**: It cannot match synonyms, paraphrases, or conceptually related terms. "fix the authentication bug" would score 0 against a memory about "resolve the login vulnerability" despite being the same issue.

2. **Scoring formula is suspect**: `rerankScore = originalScore * 0.4 + tfScore * 0.4 + (1 - lengthPenalty) * 0.2` — the length penalty term `(1 - lengthPenalty)` actually rewards longer documents, which biases toward verbose memories regardless of relevance.

3. **For a PR review pipeline**: Code review contexts contain highly technical, domain-specific language. Term overlap fails on variable names, function signatures, and architectural patterns that require semantic understanding.

**Recommended fix**: Either:
- (A) Deploy BAAI/bge-reranker-v2-m3 via a separate Ollama model call (Ollama supports embedding models) and compute actual cosine similarity
- (B) Use Supabase's pgvector cosine distance directly in `get_similar_memories` with a tighter `match_count` and skip the reranker entirely — the RPC already orders by embedding distance
- (C) At minimum, use TF-IDF scoring with a proper tokenizer instead of raw term overlap

Option (B) is the pragmatic choice: the Memory Retrieval node already returns results ordered by vector similarity. A secondary reranker adds complexity without value unless it uses a different scoring model.

---

## Eval Gate Assessment

**The eval gate is currently NEITHER deterministic cosine similarity NOR LLM-based. It is a no-op.**

Current behavior:
```javascript
const faithfulness = typeof response.faithfulness_score === 'number' 
  ? response.faithfulness_score 
  : 0.8;  // Always falls through to this default
const relevance = typeof response.relevance_score === 'number' 
  ? response.relevance_score 
  : 0.7;  // Always falls through to this default
const passed = faithfulness >= 0.7 && relevance >= 0.6;
// Result: 0.8 >= 0.7 && 0.7 >= 0.6 → ALWAYS TRUE
```

Ollama's `/api/generate` returns `{ response: "text", eval_count: N, ... }` — no `faithfulness_score` or `relevance_score` fields exist. The gate passes 100% of the time.

**It should be deterministic cosine similarity**, because:
1. LLM-based evaluation creates a circular dependency (using an LLM to judge an LLM)
2. Cosine similarity between query embedding and response embedding is fast, deterministic, and measurable
3. Threshold of 0.72 provides a meaningful quality floor

**Implementation requires**:
1. Generate an embedding of the LLM response (call Ollama's `/api/embed` endpoint or a dedicated embedding model)
2. Compare against the query embedding using cosine similarity
3. Gate on threshold 0.72

---

## Priority Fix List

### 1. Fix the Eval Gate — implement deterministic cosine similarity
**Why first**: Without a working eval gate, the pipeline has zero quality control. Bad LLM outputs go directly to users.

**Implementation**:
Add an embedding call before the Eval Gate node. Insert a new HTTP Request node ("Embed Response") between LLM Call and Eval Gate:
```json
{
  "method": "POST",
  "url": "https://api.ollama.com/api/embed",
  "headers": { "Authorization": "Bearer $OLLAMA_API_KEY" },
  "body": {
    "model": "nomic-embed-text",
    "input": "{{ $('LLM Call').item.json.response }}"
  }
}
```
Then update the Eval Gate code:
```javascript
const queryEmb = $('Sig Validator').item.json.body.embedding || [];
const respEmb = $('Embed Response').item.json.embeddings[0] || [];

function cosineSim(a, b) {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const similarity = cosineSim(queryEmb, respEmb);
const passed = similarity >= 0.72;

return [{ json: {
  eval_passed: passed,
  similarity_score: similarity,
  threshold: 0.72,
  answer: passed ? $('LLM Call').item.json.response : 'Low confidence response filtered by eval gate.',
  fallback: !passed,
  original_response: $('LLM Call').item.json
}}];
```

### 2. Fix Memory Store — include embedding vector on write
**Why second**: Without embeddings, the memory loop is completely broken. The pipeline stores memories it can never retrieve.

**Implementation**:
Add the same embedding model call for the response, then update Memory Store's jsonBody:
```json
{
  "type": "{{ $('Eval Gate').item.json.eval_passed ? 'win' : 'loss' }}",
  "content": "{{ query }} => {{ answer.substring(0, 500) }}",
  "score": "{{ $('Eval Gate').item.json.similarity_score }}",
  "embedding": "{{ $('Embed Response').item.json.embeddings[0] }}"
}
```
This ensures every stored memory has a vector(768) embedding that `get_similar_memories` can match against.

### 3. Fix the Reranker — use pgvector similarity or deploy real model
**Why third**: The term-overlap heuristic degrades retrieval quality for every request.

**Quickest fix** — bypass the Reranker entirely and increase `match_count` in Memory Retrieval:
```json
{
  "query_embedding": "{{ embedding }}",
  "match_count": 5
}
```
Since `get_similar_memories` already returns results ordered by cosine distance, the Top-5 Filter can work directly on Memory Retrieval output. Remove the Reranker node or make it a pass-through until a real model is deployed.

**Better fix** — replace the term-overlap code in `reranker/index.ts` with an Ollama embedding call:
```typescript
const embedRes = await fetch("https://api.ollama.com/api/embed", {
  method: "POST",
  headers: { "Authorization": `Bearer ${Deno.env.get("OLLAMA_API_KEY")}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: "nomic-embed-text", input: query })
});
const queryEmb = (await embedRes.json()).embeddings[0];

// Then compute cosine similarity between queryEmb and each document's embedding
```

### 4. Add agent_feedback table + update_win_streak trigger
**Why fourth**: Closes the feedback loop for continuous improvement.

**Implementation** — create migration 018:
```sql
CREATE TABLE IF NOT EXISTS public.agent_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id UUID REFERENCES ai_traces(id),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_win_streak()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.rating >= 4 THEN
    UPDATE agent_memory 
    SET score = LEAST(score + 0.05, 1.0)
    WHERE content LIKE '%' || (SELECT query FROM ai_traces WHERE id = NEW.trace_id) || '%'
    AND type = 'win';
  ELSIF NEW.rating <= 2 THEN
    UPDATE agent_memory 
    SET type = 'loss', score = GREATEST(score - 0.1, 0.0)
    WHERE content LIKE '%' || (SELECT query FROM ai_traces WHERE id = NEW.trace_id) || '%'
    AND type = 'win';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_win_streak
  AFTER INSERT ON agent_feedback
  FOR EACH ROW EXECUTE FUNCTION update_win_streak();
```

### 5. Add confidence-based model fallback cascade to LLM Call
**Why fifth**: Prevents single-model failures from killing the entire pipeline.

**Implementation** — replace the single LLM Call node with a Code node that tries models in sequence:
```javascript
const task = $('Sig Validator').item.json.body.task || 'default';
const modelMap = {
  'review': ['qwen3.5:397b', 'kimi-k2.5', 'glm-5', 'deepseek-v3.2'],
  'security': ['qwen3.5:397b', 'kimi-k2.5', 'glm-5', 'deepseek-v3.2'],
  'code': ['glm-5', 'qwen3.5:397b', 'deepseek-v3.2'],
  'fix': ['glm-5', 'qwen3.5:397b', 'deepseek-v3.2'],
  'financial': ['kimi-k2.5', 'deepseek-v3.2', 'glm-5'],
  'payment': ['kimi-k2.5', 'deepseek-v3.2', 'glm-5'],
  'default': ['deepseek-v3.2', 'glm-5', 'kimi-k2.5']
};

const models = modelMap[task] || modelMap['default'];
const context = ($('Top-5 Filter').item.json.top_memories || [])
  .map(m => m.content || JSON.stringify(m)).join('\n---\n');
const query = $('Sig Validator').item.json.body.query || '';
const prompt = `Context:\n${context}\n\nQuery: ${query}`;

for (const model of models) {
  try {
    const resp = await fetch('https://api.ollama.com/api/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${$env.OLLAMA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, prompt, stream: false })
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.response && data.response.length > 50) {
        return [{ json: { ...data, model_used: model, fallback_used: model !== models[0] } }];
      }
    }
  } catch (e) { continue; }
}

return [{ json: { response: 'All models failed', error: true } }];
```

---

## Final Verdict

**NOT production-ready. Do not use for real PR reviews yet.**

The pipeline's structural skeleton is sound — 13 nodes in the correct order, correct API endpoints, correct Supabase integration points. But the critical internals are broken:

1. **The eval gate is a no-op** — every response passes regardless of quality. This means garbage LLM outputs will be presented as valid PR review feedback.

2. **The memory loop is broken** — memories are stored without embeddings, so they can never be retrieved. The pipeline cannot learn or improve over time.

3. **The reranker is a toy** — term overlap cannot provide meaningful semantic ranking for code review contexts.

**Minimum viable production threshold**: Fix items #1 (eval gate) and #2 (memory embeddings). These two fixes alone would raise the alignment score from 62% to ~78% and make the pipeline functionally correct, even if not optimal.

**Safe to deploy after**: Fixes #1, #2, and #3 are complete, plus verification that migrations 011-014 are applied to the production Supabase instance (fix the `SUPABASE_ACCESS_TOKEN` secret to `sbp_` format PAT).

---
*Generated by Claude (fallback) — Ollama API returned 401 Unauthorized for deepseek-r1, deepseek-r1:latest, deepseek-r1:7b*
*Analysis based on: n8n_rag_pipeline_kimi_final.json, skills/IMPLEMENTATION_FEED.md, supabase/migrations/014_rag_pipeline.sql, supabase/functions/reranker/index.ts*
