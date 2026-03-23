---
name: Numeria
description: "Autonomous Numerai staking engine. Weekly pipeline: downloads features, trains LightGBM models, submits predictions, and stakes NMR. Auto-compounds 50% of earnings with halving mechanism after burns."
---

# Numeria: Numerai Staking Engine

## Overview
Numeria is a production-ready autonomous staking agent for the Numerai tournament. It trains LightGBM models on weekly feature data, submits predictions, and stakes NMR with risk-managed position sizing. Earnings are auto-compounded and converted to ZAR via XRPL and PayFast.

## Tournament Specifications

### Numerai Configuration
- **Tournament:** Numerai (weekly)
- **Feature Set:** 1,053 features (v4.3)
- **Target:** `target_20d` (primary), `target_60d` (auxiliary)
- **Evaluation:** Mean Correlation with MMC multiplier
- **Current Prize Pool:** $325,000 NMR (February 2026 payout)
- **Competitors:** 2,000+ LLM-based models

### Staking Strategy
| Parameter | Value |
|-----------|-------|
| Starting NMR | 10 NMR (~$74.70) |
| Auto-compound | 50% of weekly earnings |
| Position Cap | 100 NMR (hard ceiling) |
| Burn Response | Halve stake after 3 consecutive burns |
| Target Multiplier | MMC 2.0× |

### AI Model Stack
| Role | Model | Provider | Function |
|------|-------|----------|----------|
| Feature Analysis | DeepSeek-V3.2 671B | DeepSeek | Feature selection, metadata generation |
| Model Training | GLM-5 32B | DeepSeek | LightGBM hyperparameter optimization |
| Financial Audit | Kimi-K2.5 32B | Moonshot | Stake sizing, risk assessment |

## Technical Implementation

### Training Pipeline
1. **Data Download** - Weekly `numerai_training_data.parquet`
2. **Feature Engineering** - 1,053 features → 350 selected features
3. **Model Training** - LightGBM with 5-fold time series CV
4. **Prediction Generation** - 60,000+ live predictions
5. **Submission** - API upload to `numerai-submission-7`
6. **Staking** - NMR staked via `numerai-stake-7` endpoint

### Database Schema
```sql
CREATE TABLE tournament_rounds (
    round_number INTEGER PRIMARY KEY,
    open_time TIMESTAMPTZ NOT NULL,
    close_time TIMESTAMPTZ NOT NULL,
    resolve_time TIMESTAMPTZ NOT NULL,
    feature_version VARCHAR(16) DEFAULT '4.3'
);

CREATE TABLE model_performance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    round_number INTEGER REFERENCES tournament_rounds(round_number),
    model_name VARCHAR(64) DEFAULT 'numeria_v7',
    correlation DECIMAL(6,5) NOT NULL,
    mmc DECIMAL(6,5) NOT NULL,
    sharpe_ratio DECIMAL(6,3),
    stake_nmr NUMERIC(12,6) NOT NULL,
    payout_nmr NUMERIC(12,6),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE staking_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    transaction_hash VARCHAR(128) UNIQUE,
    round_number INTEGER NOT NULL,
    stake_amount NUMERIC(12,6) NOT NULL,
    current_correlation DECIMAL(6,5),
    burn_count INTEGER DEFAULT 0,
    status VARCHAR(32) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### n8n Workflow Nodes
1. **Round Monitor** - Checks new round every Thursday 00:00 UTC
2. **Data Download** - Fetches latest training data
3. **Model Training** - Runs LightGBM with GLM-5 optimization
4. **Prediction Submit** - Uploads to Numerai API
5. **Stake Calculator** - Determines NMR amount (capped at 100 NMR)
6. **Auto-compound** - Reinvests 50% of earnings
7. **Payment Routing** - NMR→XRPL→PayFast→ZAR

### Risk Management
- **Burn Protection:** After 3 consecutive negative rounds, stake halved
- **Correlation Floor:** Stop staking if 4-week avg correlation < 0.01
- **NMR Price Volatility:** Hedge via USDC swaps on XRPL DEX
- **Model Degradation:** Fallback to simple linear model if primary fails

## Revenue Projections
- **Starting Stake:** 10 NMR ($74.70)
- **Weekly ROI:** 2.5% (conservative)
- **Auto-compound:** 50% reinvestment
- **Month 1 Projection:** 12.8 NMR ($95.62) total value
- **Conversion:** NMR→XRPL→ZAR via PayFast (2.1% fee)
