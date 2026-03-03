# Solana Hybrid Sniper Ultra

## Overview
A Solana meme token trading bot combining SNIPER, MG (Mega Growth), and HWR (High Win Rate) strategies, with an XGBoost ML prediction engine and a cyberpunk-themed React web dashboard.

## Architecture

### Web Dashboard (Node.js / React)
- **Backend**: Express server on port 5000 serving API + Vite frontend
- **Frontend**: React with Shadcn UI, cyberpunk neon dark theme (green/purple)
- **Database**: PostgreSQL via Drizzle ORM
- **API Routes**: `/api/bot/status`, `/api/bot/trades`, `/api/bot/candidates`

### Python Trading Bot (`solana_hybrid_sniper_ultra/`)
- **bot.py**: Main async loop scanning tokens every 2s
- **strategy.py**: Hybrid strategy (SNIPER/MG/HWR mode switching)
- **features.py**: Feature extraction (RSI, VoV)
- **executor_paper.py**: Paper trading executor logging to JSON
- **ml/train.py**: XGBoost model training
- **ml/predict.py**: Real-time ML predictions
- **ml/model.pkl**: Trained XGBoost model binary
- **server.py**: FastAPI server for Python-side signals
- **utils/**: Data fetching, Solana client, Helius RPC, Jupiter swap, indicators, helpers

## Key Files
- `shared/schema.ts` - Database schema (bot_status, trades, candidates)
- `shared/routes.ts` - API route definitions
- `server/routes.ts` - Express route handlers
- `server/storage.ts` - Database CRUD operations
- `client/src/pages/dashboard.tsx` - Main dashboard page
- `client/src/pages/logs.tsx` - System logs viewer
- `client/src/pages/settings.tsx` - Bot configuration page
- `client/src/components/layout.tsx` - Sidebar layout
- `client/src/components/stat-card.tsx` - Stat display card
- `client/src/components/live-feed-table.tsx` - Trade feed table
- `client/src/hooks/use-bot-data.ts` - React Query hooks for API

## Running
- Web dashboard: `npm run dev` (auto-started via workflow)
- Python bot: `cd solana_hybrid_sniper_ultra && python3 bot.py`
- Python API: `cd solana_hybrid_sniper_ultra && python3 server.py`
- Train ML model: `python3 solana_hybrid_sniper_ultra/ml/train.py`

## Dependencies
- Node.js packages managed via package.json
- Python packages: pandas, xgboost, numpy, scikit-learn, aiohttp, fastapi, uvicorn, python-dotenv, base58
