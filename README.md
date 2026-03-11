# Apex — AI-Powered Digital Income Platform for South Africa

A living Next.js 16 platform that helps South African creators build sustainable digital income. Built in the Vaal Triangle, Gauteng.

---

## ✅ Pillars Completed

| Pillar | Status | Description |
|--------|--------|-------------|
| **Pillar 1** | ✅ Live | Sentient Vessel — EmotionalSwarm (WebGL), EmotionalGrid, MagneticReticle, SensoryControls |
| **Pillar 2** | ✅ Live | GEO + SA Province Intelligence + TTS + Real News (Perplexity Sonar) |
| **Pillar 3** | ✅ Live | Identity Matrix + Empathy Engine + Code Switch + Sentiment Analysis |
| **Pillar 4** | ✅ Live | Security Headers, Rate Limiting, OTEL Observability → Grafana Cloud |
| **Pillar 5** | ✅ Live | Speed Insights — FCP/LCP/INP optimisation, Cape Town edge region |

---

## 🚀 Deployment (Vercel — Hobby Plan)

### Environment Variables

Set in **Vercel Dashboard → Project → Settings → Environment Variables**:

| Variable | Description | Required |
|----------|-------------|----------|
| `GROQ_API_KEY` | Groq API key (llama-3.1-8b-instant / llama-3.3-70b) | ✅ Yes |
| `PERPLEXITY_API_KEY` | Perplexity Sonar — live SA news + Scout Agent research | ✅ Yes |
| `GRAFANA_OTLP_ENDPOINT` | Grafana Cloud OTLP URL | ✅ Yes |
| `GRAFANA_INSTANCE_ID` | Grafana instance ID | ✅ Yes |
| `GRAFANA_API_KEY` | Grafana Access Policy Token | ✅ Yes |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Canonical OTLP endpoint used by `@vercel/otel` | ✅ Yes |
| `OTEL_EXPORTER_OTLP_HEADERS` | `Authorization=Basic base64(instanceId:apiKey)` | ✅ Yes |
| `IP_LOG_SALT` | 32-byte hex string for pseudonymised IP logging | ✅ Yes |
| `HEALTH_DETAILS_TOKEN` | Token for `/api/health` internal diagnostics | Recommended |
| `KIMI_API_KEY` / `MPC_APEX` | Kimi K2 (complex queries) via api.moonshot.cn | Optional |
| `HF_TOKEN` | Hugging Face token for local sentiment analysis | Optional |
| `GITHUB_TOKEN` | GitHub PAT for higher API rate limits (5 000 vs 60/hr) | Optional |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key | Optional |
| `XRPL_SERVICE_URL` | External Python service URL for live XRPL submission | Optional |

> **Note:** Vercel auto-deploys from environment variables. GitHub Secrets are only used by GitHub Actions CI/CD.

### Deploy

1. Add environment variables in Vercel Dashboard
2. Push to `main` → Vercel auto-deploys to `cpt1` (Cape Town) region
3. Verify: `curl https://your-app.vercel.app/api/health`

---

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Service status — OTEL, AI keys, security config |
| `/api/analytics` | POST | Fire-and-forget page view counter (OTEL) |
| `/api/ai-agent` | POST | Streaming AI chat — Scout Agent + tiered model routing |
| `/api/ai-agent/proactive` | POST | SSE stream with XRPL transaction intent detection |
| `/api/ai-agent/proactive/submit` | POST | XRPL transaction submission (requires `XRPL_SERVICE_URL`) |
| `/api/news` | GET | Live SA news via Perplexity Sonar, cached 10 min |
| `/api/blogs` | GET | Blog content |
| `/api/trading` | GET | Trading signals |
| `/api/social` | GET | Social media content ideas |
| `/api/reels` | GET | Reels content ideas |
| `/api/metrics` | GET | Real GitHub repository metrics (stars, forks, issues, watchers) |
| `/api/github-metrics` | GET | GitHub metrics only (no platform data) |
| `/api/register` | POST | User registration |
| `/api/assistant` | POST | Standalone AI chat (non-streaming) |
| `/api/mx/[slug]` | GET | MX content routing (opportunities, news, trading, social, blogs, reels) |

---

## 🤖 AI Model Routing

| Tier | Model | Provider | Use Case |
|------|-------|----------|----------|
| Simple | `llama-3.1-8b-instant` | Groq | Quick queries, low cost |
| Complex | `kimi-k2-0711-preview` | Moonshot AI | Deep analysis, planning |
| Research | `sonar` | Perplexity | Live web search, SA news |
| Fallback | `llama-3.3-70b-versatile` | Groq | When Kimi K2 unavailable |

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Animations | Framer Motion |
| 3D / WebGL | React Three Fiber + Drei + Three.js |
| Icons | Lucide React |
| AI — Chat | Groq (llama-3.1-8b / llama-3.3-70b) |
| AI — Complex | Kimi K2 via Moonshot AI |
| AI — Search | Perplexity Sonar |
| Observability | OpenTelemetry → Grafana Cloud |
| Deployment | Vercel Hobby (Cape Town `cpt1`) |
| Tests | Vitest (227 passing) |

---

## 📊 Grafana Metrics

Custom OTEL counters exported to Grafana Cloud:

| Metric | Description |
|--------|-------------|
| `apex_page_view_total` | Page views |
| `apex_registration_total` | User registrations |
| `apex_chat_session_total` | AI chat sessions |
| `apex_scout_run_total` | Scout Agent runs by status |
| `apex_scout_opportunities_found_total` | Verified opportunities found |
| `apex_agent_query_total` | AI queries by tier and status |
| `apex_inference_latency_ms` | Inference latency histogram by provider |
| `apex_rate_limit_total` | Rate-limited requests |
| `apex_ssrf_block_total` | SSRF attempts blocked |

```promql
# Page views per minute
rate(apex_page_view_total[5m])

# AI query success rate
sum(rate(apex_agent_query_total{status="success"}[5m])) / sum(rate(apex_agent_query_total[5m]))

# P95 inference latency
histogram_quantile(0.95, rate(apex_inference_latency_ms_bucket[5m]))
```

---

## 📁 Project Structure

```
Apex/
├── instrumentation.ts              # OpenTelemetry initialisation (@vercel/otel)
├── middleware.ts                   # Security headers + rate limiting + NDJSON routing
├── next.config.ts                  # Next.js config — compress, AVIF, dynamic imports
├── vercel.json                     # Vercel deployment — region cpt1, function timeouts
├── src/
│   ├── app/
│   │   ├── page.tsx                # Main landing page — Sentient Interface
│   │   ├── layout.tsx              # Root layout — fonts, metadata
│   │   ├── globals.css             # Liquid Glass styles + motion/touch a11y
│   │   ├── blogs/page.tsx          # Blogs department
│   │   ├── news/page.tsx           # Live news department
│   │   ├── opportunities/page.tsx  # Opportunities department
│   │   ├── reels/page.tsx          # Reels department
│   │   ├── social/page.tsx         # Social department
│   │   ├── trading/page.tsx        # Trading department
│   │   └── api/
│   │       ├── ai-agent/route.ts               # Main streaming AI agent
│   │       ├── ai-agent/proactive/route.ts     # XRPL-aware proactive stream
│   │       ├── ai-agent/proactive/submit/route.ts  # XRPL submit (requires XRPL_SERVICE_URL)
│   │       ├── analytics/route.ts              # Page view OTEL counter
│   │       ├── assistant/route.ts              # Non-streaming AI chat
│   │       ├── blogs/route.ts
│   │       ├── github-metrics/route.ts         # Real GitHub API metrics
│   │       ├── health/route.ts                 # Service health check
│   │       ├── metrics/route.ts                # Real GitHub metrics (no fabricated data)
│   │       ├── mx/[slug]/route.ts              # Content MX routing
│   │       ├── news/route.ts                   # Perplexity live news
│   │       ├── reels/route.ts
│   │       ├── register/route.ts
│   │       ├── social/route.ts
│   │       └── trading/route.ts
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatSpeakButton.tsx             # TTS on assistant messages
│   │   │   └── ProvinceEconomicPanel.tsx       # SA province selector
│   │   ├── geo/
│   │   │   ├── AgentReadableChunk.tsx          # GEO sr-only summaries
│   │   │   └── JsonLdScript.tsx                # JSON-LD injection
│   │   ├── heart/
│   │   │   ├── ErrorExperience.tsx
│   │   │   ├── MindfulDisclosure.tsx
│   │   │   └── SpeakButton.tsx
│   │   └── sentient/
│   │       ├── EmotionalGrid.tsx               # CSS variable morphing wrapper
│   │       ├── EmotionalSwarm.tsx              # WebGL particle swarm (R3F)
│   │       ├── MagneticReticle.tsx             # Custom cursor with spring physics
│   │       ├── ReducedMotionGate.tsx           # Skips Three.js for reduced-motion users
│   │       ├── SensoryControls.tsx             # A11y toggles — audio/haptics/motion
│   │       └── SentientCanvasScene.tsx         # Three.js canvas + network-aware gate
│   ├── hooks/
│   │   ├── useEmotionEngine.tsx                # 4-state emotion FSM
│   │   ├── useMagneticCursor.ts                # Cursor spring physics
│   │   ├── useMultiSensory.ts                  # Web Audio + haptics
│   │   ├── useSensoryPreferences.ts            # Saved a11y preferences
│   │   ├── useSpeech.ts                        # Web Speech API TTS
│   │   └── useVoiceInput.ts                    # Web Speech API STT
│   ├── lib/
│   │   ├── api-utils.ts                        # Logging, rate limiting, fetch helpers
│   │   ├── metrics.ts                          # OTEL counters + histograms
│   │   ├── version.ts                          # APP_VERSION constant
│   │   ├── agents/
│   │   │   ├── codeSwitch.ts                   # SA language code switching
│   │   │   ├── empathyEngine.ts                # Empathy-aware response enrichment
│   │   │   ├── identityMatrix.ts               # Apex identity + persona
│   │   │   └── scout-agent.ts                  # Live opportunity discovery
│   │   ├── ai/
│   │   │   ├── apexIdentityMiddleware.ts        # Tone validation + identity enrichment
│   │   │   └── sentimentAnalysis.ts             # HF-based / local sentiment
│   │   ├── ai-agent/contracts.ts               # NDJSON event contracts
│   │   ├── geo/
│   │   │   ├── agent-classifier.ts
│   │   │   ├── markdown-renderer.ts
│   │   │   ├── memory-store.ts
│   │   │   └── schema-builder.ts               # JSON-LD TechArticle builder
│   │   ├── observability/pillar4Metrics.ts     # Department route metrics
│   │   ├── performance/yieldToMain.ts          # Long-task yielding utility
│   │   ├── sa-context/provinces.ts             # SA province data (census)
│   │   └── streaming/
│   │       ├── ndjson.ts
│   │       └── OptimisticTransactionUI.tsx     # XRPL optimistic UI components
│   ├── styles/sentient.css                     # Sentient canvas styles
│   └── types/index.ts
├── tests/
│   ├── pillar3-heart.test.ts                   # 79 tests
│   ├── pillar4-bones.test.ts                   # 148 tests
│   ├── pillar5-performance.test.ts
│   └── security-contracts.test.ts
└── .github/workflows/security-regression.yml
```

---

## 🏃 Local Development

```bash
bun install
bun run dev     # http://localhost:3000
bun run lint    # ESLint
bun run build   # Production build
bun test        # 227 tests
```

---

## 📜 License

MIT License — Built with ❤️ for the Apex community
