# Solana Hybrid Sniper Ultra

## Overview
A Solana meme token trading bot combining SNIPER, MG (Mega Growth), and HWR (High Win Rate) strategies, with an XGBoost ML prediction engine and a cyberpunk-themed React web dashboard. Features a real-time trading engine that scans DexScreener for tokens, evaluates market conditions, executes paper trades, and tracks P&L with auto take-profit/stop-loss.

## Architecture

### Web Dashboard (Node.js / React)
- **Backend**: Express server on port 5000 serving API + Vite frontend
- **Frontend**: React with Shadcn UI, cyberpunk neon dark theme (green/purple)
- **Database**: PostgreSQL via Drizzle ORM
- **Trading Engine**: Server-side background scanner + position manager running on intervals
- **API Routes**:
  - `GET /api/bot/status` - Bot status (balance, PNL, win rate, open positions, last signal)
  - `GET /api/bot/trades` - All trades with live P&L for open positions
  - `GET /api/trades/open` - Currently open positions only
  - `GET /api/bot/candidates` - DB candidates
  - `GET /api/candidates/live` - Real-time DexScreener token scanning (8s cache)
  - `POST /api/bot/trading-mode` - Toggle paper/live trading
  - `POST /api/bot/toggle` - Start/stop bot
  - `POST /api/bot/strategy-mode` - Switch strategy (SNIPER/MG/HWR/AUTO)

### Trading Engine (server/routes.ts)
- **Scanner**: Every 15s, fetches latest tokens from DexScreener, evaluates market conditions
- **Evaluator**: Checks liquidity (>$500), buy pressure, volume momentum, price change, age
- **Strategies**: SNIPER (new <2min, low liq), MG (momentum growth), HWR (high win rate confidence)
- **Position Manager**: Every 10s, checks current prices for open trades
  - Take Profit: +25%
  - Stop Loss: -15%
  - Max Hold Time: 300s (5 min)
  - Max Open Positions: 5
- **Wallet Tracking**: Paper balance starts at 10 SOL, adjusts on each buy/sell

### Python Trading Bot (`solana_hybrid_sniper_ultra/`)
- **bot.py**: Standalone async bot with same logic (for CLI use)
- **strategy.py**: Hybrid strategy with rug-pull/liquidity filters
- **ml/train.py**: XGBoost model training (5000 samples, 13 features)
- **ml/predict.py**: ML predictions with heuristic fallback
- **executor_paper.py / executor_live.py**: Paper/live execution

## Database Schema
- `bot_status`: mode, tradingMode, isRunning, walletBalance, totalPnl, winRate, totalTrades, openPositions, lastSignal
- `trades`: tokenAddress, tokenSymbol, type (BUY/SELL), mode, tradingMode, status (OPEN/CLOSED), amount, price, currentPrice, pnl, exitPrice, txHash, closedAt
- `candidates`: tokenAddress, tokenSymbol, liquidity, pumpProbability, dumpRisk, ageSeconds, qualifiedMode

## Key Files
- `shared/schema.ts` - Database schema with trade status tracking
- `server/routes.ts` - Trading engine + DexScreener integration + API routes
- `server/storage.ts` - Database CRUD with trade management
- `client/src/pages/dashboard.tsx` - Dashboard with 6 stat cards, 3 tabs, last signal indicator
- `client/src/components/live-feed-table.tsx` - Trade table with open/closed status, live P&L
- `client/src/hooks/use-bot-data.ts` - React Query hooks

## Running
- Web dashboard: `npm run dev` (auto-started via workflow)
- Python bot: `cd solana_hybrid_sniper_ultra && python3 bot.py`
- Train ML model: `python3 solana_hybrid_sniper_ultra/ml/train.py`

## Dependencies
- Node.js packages managed via package.json
- Python 3.11 with: pandas, xgboost, numpy, scikit-learn, aiohttp, fastapi, uvicorn, python-dotenv, base58, solders
