# Solana Hybrid Sniper Ultra

## Overview
A Solana meme token trading bot combining SNIPER, MG (Mega Growth), and HWR (High Win Rate) strategies, with an XGBoost ML prediction engine and a cyberpunk-themed React web dashboard. Supports toggling between paper and live trading modes. Uses real DexScreener API data for live token scanning.

## Architecture

### Web Dashboard (Node.js / React)
- **Backend**: Express server on port 5000 serving API + Vite frontend
- **Frontend**: React with Shadcn UI, cyberpunk neon dark theme (green/purple)
- **Database**: PostgreSQL via Drizzle ORM
- **API Routes**:
  - `GET /api/bot/status` - Bot status with trading mode
  - `GET /api/bot/trades` - Recent trades with PNL
  - `GET /api/bot/candidates` - Sniper candidates with pump probability and dump risk
  - `GET /api/candidates/live` - Real-time DexScreener token scanning (8s cache)
  - `POST /api/bot/trading-mode` - Toggle paper/live trading
  - `POST /api/bot/toggle` - Start/stop bot
  - `POST /api/bot/strategy-mode` - Switch strategy (SNIPER/MG/HWR/AUTO)

### Python Trading Bot (`solana_hybrid_sniper_ultra/`)
- **bot.py**: Main async loop with paper/live mode switching, real DexScreener data
- **strategy.py**: Hybrid strategy with rug-pull/liquidity filters (SNIPER/MG/HWR mode switching)
- **features.py**: Feature extraction (RSI, VoV, buy pressure, volume momentum, liquidity score)
- **executor_paper.py**: Paper trading executor logging to JSON
- **executor_live.py**: Live trading executor via Jupiter v6 swaps
- **ml/train.py**: XGBoost model training on 5000 synthetic samples (13 features, pump/dump/flat/rug scenarios)
- **ml/predict.py**: Real-time ML predictions with heuristic fallback (v2.0 model with 13 features)
- **ml/model.pkl**: Trained XGBoost model binary (v2.0)
- **ml/training_data.csv**: Generated training dataset
- **server.py**: FastAPI server for Python-side signals
- **utils/data_fetcher.py**: Real DexScreener API integration (token-profiles, token pairs, search endpoints)
- **utils/**: Solana client, Helius RPC, Jupiter swap execution, indicators, helpers

## Data Pipeline
- DexScreener `/token-profiles/latest/v1` → latest Solana token listings
- DexScreener `/latest/dex/tokens/{address}` → pair details (txns, volume, priceChange, liquidity, fdv)
- Features extracted: age_seconds, liquidity_usd, volume_5m/1h/24h, volume_change_1m, price_change_5m/1h, buy_pressure_5m/1h, buy_sell_ratio, tx_velocity, fdv, liq_to_mcap
- XGBoost v2.0 model predicts pump_probability from 13 features

## Key Files
- `shared/schema.ts` - Database schema (bot_status with tradingMode, trades with txHash, candidates with dumpRisk)
- `server/routes.ts` - Express route handlers including live DexScreener scanning
- `server/storage.ts` - Database CRUD operations with trading mode updates
- `client/src/pages/dashboard.tsx` - Main dashboard with paper/live toggle, 3 tabs (Trades, Candidates, Live Scanner)
- `client/src/hooks/use-bot-data.ts` - React Query hooks including useLiveCandidates
- `client/src/components/live-feed-table.tsx` - Trade feed with trading mode badges

## Running
- Web dashboard: `npm run dev` (auto-started via workflow)
- Python bot: `cd solana_hybrid_sniper_ultra && python3 bot.py`
- Train ML model: `python3 solana_hybrid_sniper_ultra/ml/train.py`

## Dependencies
- Node.js packages managed via package.json
- Python 3.11 with: pandas, xgboost, numpy, scikit-learn, aiohttp, fastapi, uvicorn, python-dotenv, base58, solders
