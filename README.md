# Apex - Sentient Interface

A modern Next.js landing page with real-time GitHub metrics, AI-powered assistant, and liquid glass design.

## ✅ Phase 1 Complete (100%)

- **Sentient Interface** - Liquid Glass effects, haptics, spatial audio, emotional pulse
- **Real-time Search** - Filter blogs and insights instantly
- **Working Registration** - Form with backend processing
- **GitHub Integration** - Live repository metrics (stars, forks, issues, watchers)
- **AI Assistant** - Functional chat widget with AI Gateway/Groq backend
- **Market Insights** - Dynamic animated metrics
- **OpenTelemetry** - Traces and metrics to Grafana Cloud

---

## 🚀 Deployment (Vercel)

### Repository Secrets Required

Add these secrets in your GitHub repository settings (Settings → Secrets and variables → Actions):

| Secret | Description | Required |
|--------|-------------|----------|
| `GRAFANA_OTLP_ENDPOINT` | Grafana Cloud OTLP URL | ✅ Yes |
| `GRAFANA_INSTANCE_ID` | Your Grafana instance ID | ✅ Yes |
| `GRAFANA_API_KEY` | Grafana Access Policy Token | ✅ Yes |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key | Optional* |
| `GROQ_API_KEY` | Groq API key | Optional* |
| `GITHUB_TOKEN` | GitHub PAT for higher rate limits | Optional |

*At least one AI service (AI Gateway or Groq) is required for the chat assistant.

### Deploy to Vercel

1. Push to `digital-apex` branch
2. Vercel will auto-deploy
3. Check `/api/health` to verify all services are configured

### Health Check Endpoint

```bash
curl https://your-app.vercel.app/api/health
```

Returns:
```json
{
  "status": "ok",
  "services": {
    "grafana": { "configured": true },
    "ai": { "aiGateway": true, "groq": false },
    "github": true
  }
}
```

---

## 📊 Grafana Cloud Setup

### Step 1: Get Your Credentials

1. Go to: https://dimakatsomoleli.grafana.net/a/grafana-setupguide-app/home
2. Navigate to **Configuration → OpenTelemetry**
3. Copy:
   - **Instance ID** (also called "User")
   - **OTLP Endpoint**: `https://otlp-gateway-prod-ap-southeast-1.grafana.net/otlp`

### Step 2: Create Access Policy Token

1. Go to **Configuration → Access Policies**
2. Click **Create Token**
3. Required scopes: `metrics:write`, `traces:write`, `logs:write`
4. Copy the token

### Step 3: Add to Repository Secrets

Add these as GitHub repository secrets:
- `GRAFANA_OTLP_ENDPOINT`
- `GRAFANA_INSTANCE_ID`
- `GRAFANA_API_KEY`

---

## 📊 Available Metrics

### Custom Metrics (Sent to Grafana)

| Metric | Description |
|--------|-------------|
| `apex_page_view_total` | Total page views |
| `apex_registration_total` | Successful registrations |
| `apex_chat_session_total` | AI chat sessions |

### Automatic Metrics (from @vercel/otel)

- HTTP latency
- Request rate
- Error rate
- Service uptime

### Grafana Queries

```promql
# Page Views
rate(apex_page_view_total[5m])

# Registrations
apex_registration_total

# Chat Sessions
rate(apex_chat_session_total[5m])
```

---

## 📁 Project Structure

```
Apex/
├── instrumentation.ts           # OpenTelemetry config
├── next.config.ts               # Next.js config
├── vercel.json                  # Vercel deployment config
├── src/
│   ├── lib/
│   │   └── metrics.ts           # Custom OpenTelemetry metrics
│   └── app/
│       ├── page.tsx             # Main landing page
│       ├── layout.tsx           # Root layout
│       ├── globals.css          # Liquid Glass styles
│       └── api/
│           ├── health/route.ts      # Health check
│           ├── analytics/route.ts   # Page view tracking
│           ├── assistant/route.ts   # AI chat
│           ├── register/route.ts    # User registration
│           ├── metrics/route.ts     # Combined metrics
│           └── github-metrics/route.ts  # GitHub API
├── config/
│   └── grafana-alloy-config.alloy   # Grafana Alloy config
├── scripts/
│   └── setup-grafana-alloy.sh       # Setup script
└── .env.example                 # Environment template
```

---

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GRAFANA_OTLP_ENDPOINT` | Grafana Cloud OTLP URL | ✅ Yes |
| `GRAFANA_INSTANCE_ID` | Your Grafana instance ID | ✅ Yes |
| `GRAFANA_API_KEY` | Access Policy Token | ✅ Yes |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key | Optional |
| `GROQ_API_KEY` | Groq API key | Optional |
| `GITHUB_TOKEN` | GitHub PAT | Optional |

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Animations | Framer Motion |
| Icons | Lucide React |
| AI Backend | AI Gateway / Groq |
| Observability | OpenTelemetry |
| Metrics | Grafana Cloud |

---

## 📝 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check (verify secrets) |
| `/api/analytics` | POST | Track page view |
| `/api/assistant` | POST | Chat with AI |
| `/api/register` | POST | User registration |
| `/api/metrics` | GET | Combined metrics |
| `/api/github-metrics` | GET | GitHub metrics only |

---

## 🎨 Features

### Liquid Glass Effects
- Backdrop blur with saturation
- Animated reflections
- Glass morphism borders

### Sentient Interface
- **Haptic Feedback** - Vibrates on interactions (mobile)
- **Spatial Audio** - Sine wave with stereo panning
- **Heartbeat Animation** - Visual pulse with glow effect

### Real-time Updates
- 5-minute metrics cache
- Manual refresh capability
- Loading states with animations

---

## 🔗 Useful Links

- **PR #1**: https://github.com/johanneslungelo021-cmd/Apex/pull/1
- **Grafana Cloud**: https://dimakatsomoleli.grafana.net
- **Setup Guide**: https://dimakatsomoleli.grafana.net/a/grafana-setupguide-app/home

---

## 📜 License

MIT License

---

Built with ❤️ for the Apex community
