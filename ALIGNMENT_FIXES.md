# APEX RAG Pipeline — Priority Fix Checklist
**Source**: DeepSeek R1 Alignment Verification (2026-03-25)
**Workflow ID**: guwYK50fl7TKwO8V

---

- [ ] **1. Fix Eval Gate — implement deterministic cosine similarity (CRITICAL)**
  - Add "Embed Response" HTTP Request node between LLM Call and Eval Gate
  - Call `https://api.ollama.com/api/embed` with model `nomic-embed-text` to embed the LLM response
  - Replace Eval Gate code: compute cosine similarity between query embedding and response embedding
  - Gate threshold: 0.72 (reject responses below this)
  - Current state: gate defaults to 0.8/0.7 scores → always passes → zero quality control

- [ ] **2. Fix Memory Store — include embedding vector on write (CRITICAL)**
  - Use the response embedding from the new "Embed Response" node
  - Update Memory Store jsonBody to include `"embedding": {{ embeddings[0] }}`
  - Without this fix, `get_similar_memories` returns zero results (filters `embedding IS NOT NULL`)
  - Current state: memories stored without embeddings → memory loop completely broken

- [ ] **3. Fix Reranker — replace term-overlap with real semantic scoring**
  - Option A (quick): Bypass reranker, feed Memory Retrieval results directly to Top-5 Filter (pgvector already orders by similarity)
  - Option B (proper): Update `supabase/functions/reranker/index.ts` to call Ollama `/api/embed` and compute cosine similarity
  - Option C (best): Deploy BAAI/bge-reranker-v2-m3 as Ollama model and use cross-encoder scoring
  - Current state: term-overlap heuristic cannot match synonyms or semantic concepts

- [ ] **4. Add agent_feedback table + update_win_streak trigger**
  - Create migration 018 with `agent_feedback` table (trace_id FK, rating 1-5, feedback text)
  - Create `update_win_streak()` trigger function: boost win scores on positive feedback, demote to loss on negative
  - Wire a new n8n node or API endpoint to collect feedback after responses
  - Current state: component entirely missing — no feedback loop exists

- [ ] **5. Add confidence-based model fallback cascade**
  - Replace single LLM Call HTTP Request node with a Code node
  - Implement try/catch loop through model priority list per task type
  - Minimum response length check (>50 chars) before accepting
  - Cascade order: primary model → secondary → tertiary → deepseek-v3.2 (always-available fallback)
  - Current state: single model call with no retry — model failure = pipeline failure
