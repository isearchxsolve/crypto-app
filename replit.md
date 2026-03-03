# Solana Hybrid Sniper Ultra

## Overview
A Solana meme token trading bot combining SNIPER, MG (Mega Growth), and HWR (High Win Rate) strategies, with an XGBoost ML prediction engine and a cyberpunk-themed React web dashboard. Supports toggling between paper and live trading modes.

## Architecture

### Web Dashboard (Node.js / React)
- **Backend**: Express server on port 5000 serving API + Vite frontend
- **Frontend**: React with Shadcn UI, cyberpunk neon dark theme (green/purple)
- **Database**: PostgreSQL via Drizzle ORM
- **API Routes**:
  - `GET /api/bot/status` - Bot status with trading mode
  - `GET /api/bot/trades` - Recent trades with PNL
  - `GET /api/bot/candidates` - Sniper candidates with pump probability and dump risk
  - `POST /api/bot/trading-mode` - Toggle paper/live trading
  - `POST /api/bot/toggle` - Start/stop bot
  - `POST /api/bot/strategy-mode` - Switch strategy (SNIPER/MG/HWR/AUTO)

### Python Trading Bot (`solana_hybrid_sniper_ultra/`)
- **bot.py**: Main async loop with paper/live mode switching
- **strategy.py**: Hybrid strategy (SNIPER/MG/HWR mode switching)
- **features.py**: Feature extraction (RSI, VoV)
- **executor_paper.py**: Paper trading executor logging to JSON
- **executor_live.py**: Live trading executor via Jupiter v6 swaps
- **ml/train.py**: XGBoost model training
- **ml/predict.py**: Real-time ML predictions
- **ml/model.pkl**: Trained XGBoost model binary
- **server.py**: FastAPI server for Python-side signals
- **utils/**: Data fetching, Solana client, Helius RPC, Jupiter swap execution, indicators, helpers

## Key Files
- `shared/schema.ts` - Database schema (bot_status with tradingMode, trades with txHash, candidates with dumpRisk)
- `server/routes.ts` - Express route handlers including toggle endpoints
- `server/storage.ts` - Database CRUD operations with trading mode updates
- `client/src/pages/dashboard.tsx` - Main dashboard with paper/live toggle switch
- `client/src/pages/settings.tsx` - Bot configuration page
- `client/src/components/live-feed-table.tsx` - Trade feed with trading mode badges

## Running
- Web dashboard: `npm run dev` (auto-started via workflow)
- Python bot: `cd solana_hybrid_sniper_ultra && python3 bot.py`
- Train ML model: `python3 solana_hybrid_sniper_ultra/ml/train.py`

## Dependencies
- Node.js packages managed via package.json
- Python 3.11 with: pandas, xgboost, numpy, scikit-learn, aiohttp, fastapi, uvicorn, python-dotenv, base58, solders
