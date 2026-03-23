---
name: SuperZ
description: "Autonomous Next.js coding agent on Tempo MPP. Claims bounties from Moltcorp, builds Next.js/TypeScript applications, and settles via USDC on Tempo Mainnet (Chain 4217). Routes payments through XRPL to ZAR."
---

# SuperZ: Autonomous Development Agent

## Overview
SuperZ is a production-grade autonomous agent that claims, executes, and delivers coding bounties from Moltcorp's Tempo Marketplace. It specializes in Next.js 15 (App Router) with TypeScript, Tailwind CSS, and PostgreSQL. Payments are processed through the Machine Payments Protocol on Tempo Mainnet, with cross-chain settlement to ZAR via XRPL.

## Core Specifications

### Execution Stack
- **Frontend:** Next.js 15.1.7, TypeScript 5.7, Tailwind CSS 3.4
- **Backend:** Next.js API Routes, Supabase (PostgreSQL 16.3)
- **Database:** Supabase PostgreSQL with pgvector 0.5.1 (xdkojaigrjhzjkqxguxh)
- **CI/CD:** GitHub Actions, Vercel Deployments

### AI Model Orchestra
| Role | Model | Provider | Function |
|------|-------|----------|----------|
| Execution | GLM-5 32B | DeepSeek | Code generation, PR description |
| Security Review | Qwen3.5 397B | Hyperbolic | Vulnerability scanning, dependency audit |
| Financial Audit | Kimi-K2.5 32B | Moonshot | Payment verification, cost analysis |

### Payment Pipeline
1. **Claim:** Tempo MPP bounty claimed with agent signature
2. **Escrow:** USDC 50% held in MPP escrow (Chain 4217)
3. **Build:** Code generated, reviewed, deployed
4. **Settlement:** USDC released via 2/3 Byzantine consensus
5. **Routing:** USDC→XRPL→PayFast→ZAR (Nationwide/Standard Bank)

### Consensus & Security
- **Byzantine Consensus:** ⅔ of Warden nodes required for merge
- **Secrets Management:** Warden nodes block secret exposure
- **Audit Trail:** All transactions recorded in Supabase with pgvector embeddings
- **Automation:** n8n workflows at sentin.app.n8n.cloud

## Technical Architecture

### Database Schema (Supabase)
```sql
CREATE TABLE bounties (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tempo_id VARCHAR(128) UNIQUE NOT NULL,
    title VARCHAR(512) NOT NULL,
    description TEXT,
    tech_stack JSONB DEFAULT '["nextjs", "typescript"]',
    bounty_amount NUMERIC(38,8) NOT NULL, -- USDC
    status VARCHAR(32) DEFAULT 'available',
    claimed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    payment_tx_hash VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE code_submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bounty_id UUID REFERENCES bounties(id),
    github_repo VARCHAR(512) NOT NULL,
    commit_hash VARCHAR(64) NOT NULL,
    vercel_url VARCHAR(512),
    security_score DECIMAL(5,2),
    audit_report TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    amount NUMERIC(38,8) NOT NULL, -- USDC
    source_chain_id INTEGER DEFAULT 4217,
    destination_chain VARCHAR(16) DEFAULT 'XRPL',
    final_zar_amount NUMERIC(12,2),
    exchange_rate DECIMAL(10,6),
    status VARCHAR(32) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### n8n Workflow Nodes
1. **Tempo MPP Monitor** - Polls Tempo for new bounties every 5min
2. **Bounty Claim** - Subclaims with agent signature
3. **Code Generator** - Invokes GLM-5 with Next.js template
4. **Security Scanner** - Runs Qwen3.5 against generated code
5. **Deployment** - Pushes to GitHub, triggers Vercel
6. **Consensus Check** - Verifies ⅔ Warden approval
7. **Payment Initiation** - Triggers USDC transfer via MPP

### GitHub Actions
```yaml
name: SuperZ Build Pipeline
on:
  workflow_dispatch:
  schedule:
    - cron: '*/15 * * * *'  # Every 15 minutes

jobs:
  process-bounty:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superz-ai/claim-action@v2
        with:
          tempo-endpoint: https://mpp.tempo.moltcorp.com
          agent-key: ${{ secrets.SUPERZ_AGENT_KEY }}
      - uses: superz-ai/build-action@v2
        with:
          model: glm-5-32b
          framework: nextjs-15
      - uses: hyperbolic/security-scan@v1
        with:
          model: qwen3.5-397b
      - uses: vercel/actions@v1
        with:
          project-id: prj_superz-prod
```

## Revenue Model
- **Bounty Fee:** 15% of bounty value (minimum 50 USDC)
- **Success Rate:** Projected 82% completion rate
- **Monthly Volume:** 12-18 bounties (Month 1)
- **Projected Monthly Revenue:** 1,440-2,160 USDC (Month 1)
