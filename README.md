# Apex - Sentient Interface

A modern Next.js landing page with real-time GitHub metrics, AI-powered assistant, and liquid glass design.

## ✅ Phase 1 Complete

- **Sentient Interface** - Liquid Glass effects, haptics, emotional pulse
- **Real-time Search** - Filter blogs and insights instantly
- **Working Registration** - Form with AI confirmation
- **GitHub Integration** - Live repository metrics (stars, forks, issues, watchers)
- **AI Assistant** - Functional chat widget with LocalAI backend
- **Market Insights** - Dynamic animated metrics

## 🚀 Quick Start (4 minutes)

```bash
# Clone the repository
git clone https://github.com/johanneslungelo021-cmd/Apex.git
cd Apex

# Install dependencies
bun install

# Start LocalAI (zero cost AI backend)
docker run -d -p 8080:8080 localai/localai:latest

# Start the app
bun run dev
```

Open http://localhost:3000

## 📊 GitHub Metrics Setup

### Option 1: Direct API (Built-in)

The app fetches GitHub metrics automatically. For higher rate limits:

1. Create a GitHub token at https://github.com/settings/tokens
2. Scope: `public_repo` (read-only)
3. Create `.env.local`:

```env
GITHUB_TOKEN=ghp_your_token_here
```

### Option 2: Grafana Alloy (Advanced)

For Grafana Cloud integration with dashboards and alerts:

**Step 1: Create GitHub Token**
1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Name: `grafana-alloy-apex`
4. Expiration: 90 days
5. Scope: `public_repo` only
6. Copy the token

**Step 2: Store Token**
```bash
sudo mkdir -p /etc/alloy
echo "ghp_YOUR_TOKEN" | sudo tee /etc/alloy/github_token.txt
sudo chmod 600 /etc/alloy/github_token.txt
```

**Step 3: Configure Alloy**
```bash
# Copy the provided config
sudo cp config/grafana-alloy-config.alloy /etc/alloy/config.alloy

# Or append to existing config
cat config/grafana-alloy-config.alloy | sudo tee -a /etc/alloy/config.alloy
```

**Step 4: Restart Alloy**
```bash
sudo systemctl restart alloy.service
```

**Step 5: Verify in Grafana**
1. Go to https://dimakatsomoleli.grafana.net
2. Click **Test connection**
3. When green → Click **Install** dashboards

## 📁 Project Structure

```
Apex/
├── src/
│   └── app/
│       ├── page.tsx              # Main landing page
│       ├── layout.tsx            # Root layout
│       ├── globals.css           # Liquid Glass styles
│       └── api/
│           ├── assistant/route.ts  # AI chat endpoint
│           ├── register/route.ts   # User registration
│           ├── metrics/route.ts    # Combined metrics
│           └── github-metrics/route.ts  # GitHub API
├── config/
│   └── grafana-alloy-config.alloy  # Grafana config
├── .env.example                  # Environment template
└── package.json
```

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | GitHub API token for higher rate limits | Optional |
| `LOCALAI_URL` | LocalAI endpoint | Default: `http://localhost:8080` |
| `LOCALAI_MODEL` | Model to use | Default: `llama-3.3-70b` |

## 📊 Available Metrics

### GitHub Metrics
- `stars` - Repository stars
- `forks` - Repository forks
- `openIssues` - Open issues count
- `watchers` - Repository watchers
- `size` - Repository size (KB)

### Platform Metrics
- `users` - Active users
- `impact` - Total impact (Rands)
- `courses` - Courses completed

## 🛠️ Tech Stack

- **Next.js 15** - App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **Lucide React** - Icons
- **LocalAI** - AI backend (zero cost)
- **Grafana Alloy** - Metrics collection

## 📝 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/assistant` | POST | Chat with AI |
| `/api/register` | POST | User registration |
| `/api/metrics` | GET | Combined metrics |
| `/api/github-metrics` | GET | GitHub metrics only |

## 🎨 Features

### Liquid Glass Effects
- Backdrop blur with saturation
- Animated reflections
- Glass morphism borders

### Sentient Interface
- Heartbeat animations
- Haptic feedback support
- Emotional pulse visual

### Real-time Updates
- 5-minute metrics cache
- Manual refresh capability
- Loading states

## 📜 License

MIT License - See LICENSE file for details.

---

Built with ❤️ for the Apex community
