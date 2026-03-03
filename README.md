# Apex - Sentient Interface

A modern Next.js landing page with real-time GitHub metrics, AI-powered assistant, and liquid glass design.

## ✅ Phase 1 Complete (100%)

- **Sentient Interface** - Liquid Glass effects, haptics, spatial audio, emotional pulse
- **Real-time Search** - Filter blogs and insights instantly
- **Working Registration** - Form with AI confirmation
- **GitHub Integration** - Live repository metrics (stars, forks, issues, watchers)
- **AI Assistant** - Functional chat widget with LocalAI backend
- **Market Insights** - Dynamic animated metrics
- **OpenTelemetry** - Traces and metrics to Grafana Cloud

## 🚀 Quick Start (4 minutes)

```bash
# Clone the repository
git clone https://github.com/johanneslungelo021-cmd/Apex.git
cd Apex
git checkout digital-apex

# Install dependencies
bun install

# Start LocalAI (zero cost AI backend)
docker run -d -p 8080:8080 localai/localai:latest

# Start the app
bun run dev
```

Open http://localhost:3000

---

## 📊 Grafana Cloud OpenTelemetry Setup

### Step 1: Get Your Grafana Cloud Credentials

1. Go to your Grafana Cloud setup guide:
   **https://dimakatsomoleli.grafana.net/a/grafana-setupguide-app/home**

2. Navigate to **Configuration → OpenTelemetry**

3. Copy these values:
   - **Instance ID** (also called "User" in basic auth)
   - **OTLP Endpoint** (e.g., `https://otlp-gateway-prod-us-central1.grafana.net/otlp`)

4. Create an **Access Policy Token**:
   - Go to **Configuration → Access Policies**
   - Click **Create Token**
   - Required scopes: `metrics:write`, `traces:write`, `logs:write`
   - Copy the token

### Step 2: Configure Environment Variables

Create a `.env.local` file:

```env
# Grafana Cloud OpenTelemetry
GRAFANA_OTLP_ENDPOINT=https://otlp-gateway-prod-us-central1.grafana.net/otlp
GRAFANA_INSTANCE_ID=your_instance_id_here
GRAFANA_API_KEY=your_api_key_here

# GitHub API (optional but recommended)
GITHUB_TOKEN=ghp_your_github_token
```

### Step 3: Restart and Verify

```bash
bun run dev
```

Check your Grafana Cloud:
1. Go to **Explore** in Grafana
2. Select **traces** or **metrics**
3. Query: `service.name="apex-sentient-interface"`

---

## 📈 Grafana Alloy Setup (Alternative Method)

For Prometheus-style metrics via Grafana Alloy:

### Quick Setup

```bash
# Run the automated setup script
sudo ./scripts/setup-grafana-alloy.sh
```

### Manual Setup

**Step 1: Create GitHub Token**
```bash
# Go to https://github.com/settings/tokens
# Create token with scope: public_repo (read-only)
```

**Step 2: Store Token**
```bash
sudo mkdir -p /etc/alloy
echo "ghp_YOUR_TOKEN" | sudo tee /etc/alloy/github_token.txt
sudo chmod 600 /etc/alloy/github_token.txt
```

**Step 3: Configure Alloy**
```bash
sudo cp config/grafana-alloy-config.alloy /etc/alloy/config.alloy
sudo systemctl restart alloy.service
```

**Step 4: Verify**
```bash
sudo systemctl status alloy.service
curl http://localhost:12345/metrics | grep github_repo
```

---

## 📁 Project Structure

```
Apex/
├── instrumentation.ts           # OpenTelemetry configuration
├── next.config.ts               # Next.js config (instrumentation enabled)
├── src/
│   └── app/
│       ├── page.tsx             # Main landing page (Sentient Interface)
│       ├── layout.tsx           # Root layout
│       ├── globals.css          # Liquid Glass styles + animations
│       └── api/
│           ├── assistant/route.ts   # AI chat endpoint
│           ├── register/route.ts    # User registration
│           ├── metrics/route.ts     # Combined metrics
│           └── github-metrics/route.ts  # GitHub API
├── config/
│   └── grafana-alloy-config.alloy   # Grafana Alloy config
├── scripts/
│   └── setup-grafana-alloy.sh       # Automated setup script
├── .env.example                 # Environment template
└── package.json
```

---

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GRAFANA_OTLP_ENDPOINT` | Grafana Cloud OTLP URL | Yes |
| `GRAFANA_INSTANCE_ID` | Your Grafana instance ID | Yes |
| `GRAFANA_API_KEY` | Access Policy Token | Yes |
| `GITHUB_TOKEN` | GitHub API token | Optional |
| `LOCALAI_URL` | LocalAI endpoint | Default: `http://localhost:8080` |
| `LOCALAI_MODEL` | Model to use | Default: `llama-3.3-70b` |

---

## 📊 Available Metrics

### GitHub Metrics
- `github_repo_stars` - Repository stars
- `github_repo_forks` - Repository forks
- `github_repo_open_issues` - Open issues count
- `github_repo_watchers` - Repository watchers
- `github_repo_size_kb` - Repository size (KB)

### Platform Metrics
- `users` - Active users
- `impact` - Total impact (Rands)
- `courses` - Courses completed

### OpenTelemetry Traces
- Page views
- API requests
- AI assistant interactions
- Registration events

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Animations | Framer Motion |
| Icons | Lucide React |
| AI Backend | LocalAI (zero cost) |
| Observability | OpenTelemetry |
| Metrics | Grafana Cloud + Alloy |

---

## 📝 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/assistant` | POST | Chat with AI |
| `/api/register` | POST | User registration |
| `/api/metrics` | GET | Combined metrics (GitHub + Platform) |
| `/api/github-metrics` | GET | GitHub metrics only |

---

## 🎨 Features

### Liquid Glass Effects
- Backdrop blur with saturation
- Animated reflections
- Glass morphism borders

### Sentient Interface
- **Haptic Feedback** - Vibrates on all interactions (mobile)
- **Spatial Audio** - Sine wave with stereo panning
- **Heartbeat Animation** - Visual pulse with glow effect
- **Multi-sensory Responses** - Every click triggers feedback

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

MIT License - See LICENSE file for details.

---

Built with ❤️ for the Apex community
