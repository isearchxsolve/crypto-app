import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";

interface DexScreenerTokenProfile {
  chainId: string;
  tokenAddress: string;
  description?: string;
}

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  priceNative?: string;
  txns?: {
    m5?: { buys: number; sells: number };
    h1?: { buys: number; sells: number };
    h24?: { buys: number; sells: number };
  };
  volume?: { m5?: number; h1?: number; h6?: number; h24?: number };
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
}

let liveCandidatesCache: any[] = [];
let lastScanTime = 0;
const SCAN_COOLDOWN_MS = 8000;

async function fetchDexScreenerCandidates(): Promise<any[]> {
  const now = Date.now();
  if (now - lastScanTime < SCAN_COOLDOWN_MS && liveCandidatesCache.length > 0) {
    return liveCandidatesCache;
  }

  try {
    const profilesResp = await fetch("https://api.dexscreener.com/token-profiles/latest/v1");
    if (!profilesResp.ok) return liveCandidatesCache;
    const profiles: DexScreenerTokenProfile[] = await profilesResp.json() as DexScreenerTokenProfile[];
    const solanaTokens = profiles.filter((t) => t.chainId === "solana").slice(0, 6);

    const results: any[] = [];

    for (const profile of solanaTokens) {
      try {
        const tokenResp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${profile.tokenAddress}`);
        if (!tokenResp.ok) continue;
        const tokenData = await tokenResp.json() as { pairs?: DexScreenerPair[] };
        if (!tokenData.pairs || tokenData.pairs.length === 0) continue;

        const solanaPairs = tokenData.pairs.filter((p: DexScreenerPair) => p.chainId === "solana");
        if (solanaPairs.length === 0) continue;
        const pair = solanaPairs.reduce((a: DexScreenerPair, b: DexScreenerPair) =>
          ((a.liquidity?.usd || 0) > (b.liquidity?.usd || 0) ? a : b)
        );

        const liq = pair.liquidity?.usd || 0;
        const createdAt = pair.pairCreatedAt || Date.now();
        const ageSeconds = Math.floor((Date.now() - createdAt) / 1000);

        const m5buys = pair.txns?.m5?.buys || 0;
        const m5sells = pair.txns?.m5?.sells || 0;
        const h1buys = pair.txns?.h1?.buys || 0;
        const h1sells = pair.txns?.h1?.sells || 0;
        const buyPressure5m = (m5buys + m5sells) > 0 ? m5buys / (m5buys + m5sells) : 0.5;
        const buyPressure1h = (h1buys + h1sells) > 0 ? h1buys / (h1buys + h1sells) : 0.5;
        const buyRatio = h1buys / (h1sells + 0.001);
        const priceChange5m = pair.priceChange?.m5 || 0;
        const priceChange1h = pair.priceChange?.h1 || 0;

        let pumpProb = 0.3;
        if (buyRatio > 1.5) pumpProb += 0.2;
        if (buyPressure5m > 0.6) pumpProb += 0.15;
        if (priceChange5m > 5) pumpProb += 0.1;
        if (priceChange1h > 10) pumpProb += 0.1;
        if (ageSeconds < 300) pumpProb += 0.1;
        if (liq < 1000) pumpProb -= 0.2;
        pumpProb = Math.max(0.05, Math.min(0.95, pumpProb));
        const dumpRisk = +(1 - pumpProb).toFixed(3);

        let qualifiedMode = null;
        if (ageSeconds < 120 && liq < 100000 && pumpProb > 0.6 && buyPressure5m > 0.55) qualifiedMode = "SNIPER";
        else if (pumpProb > 0.7 && priceChange5m > 3) qualifiedMode = "MG";
        else if (pumpProb > 0.8 && dumpRisk < 0.25) qualifiedMode = "HWR";

        results.push({
          tokenAddress: pair.baseToken.address,
          tokenSymbol: pair.baseToken.symbol,
          tokenName: pair.baseToken.name,
          dex: pair.dexId,
          price: pair.priceUsd || "0",
          liquidity: liq.toFixed(0),
          pumpProbability: pumpProb.toFixed(3),
          dumpRisk: dumpRisk.toFixed(3),
          ageSeconds,
          qualifiedMode,
          volume5m: (pair.volume?.m5 || 0).toFixed(0),
          volume1h: (pair.volume?.h1 || 0).toFixed(0),
          volume24h: (pair.volume?.h24 || 0).toFixed(0),
          priceChange5m,
          priceChange1h,
          buys5m: m5buys,
          sells5m: m5sells,
          buys1h: h1buys,
          sells1h: h1sells,
          buyPressure5m: +buyPressure5m.toFixed(3),
          fdv: pair.fdv || 0,
          marketCap: pair.marketCap || 0,
          source: "dexscreener_live",
          timestamp: new Date().toISOString(),
        });
      } catch {
        continue;
      }
    }

    if (results.length > 0) {
      liveCandidatesCache = results;
      lastScanTime = now;
    }

    return liveCandidatesCache;
  } catch (e) {
    console.error("DexScreener fetch error:", e);
    return liveCandidatesCache;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  storage.seedInitialData().catch(console.error);

  app.get(api.status.get.path, async (req, res) => {
    const status = await storage.getBotStatus();
    res.json(status);
  });

  app.get(api.trades.list.path, async (req, res) => {
    const tradesList = await storage.getTrades();
    res.json(tradesList);
  });

  app.get(api.candidates.list.path, async (req, res) => {
    const candidatesList = await storage.getCandidates();
    res.json(candidatesList);
  });

  app.get("/api/candidates/live", async (_req, res) => {
    try {
      const live = await fetchDexScreenerCandidates();
      res.json(live);
    } catch (e) {
      console.error("Live candidates error:", e);
      res.json([]);
    }
  });

  app.post("/api/bot/trading-mode", async (req, res) => {
    const { mode, confirmed } = req.body;
    if (!mode || !["paper", "live"].includes(mode)) {
      return res.status(400).json({ message: "Invalid trading mode. Use 'paper' or 'live'." });
    }
    if (mode === "live" && !confirmed) {
      return res.status(400).json({ message: "Live trading requires explicit confirmation. Set confirmed: true." });
    }
    const status = await storage.updateTradingMode(mode);
    res.json(status);
  });

  app.post("/api/bot/toggle", async (req, res) => {
    const { isRunning } = req.body;
    if (typeof isRunning !== "boolean") {
      return res.status(400).json({ message: "isRunning must be boolean" });
    }
    const status = await storage.updateBotRunning(isRunning);
    res.json(status);
  });

  app.post("/api/bot/strategy-mode", async (req, res) => {
    const { mode } = req.body;
    if (!mode || !["SNIPER", "MG", "HWR", "AUTO"].includes(mode)) {
      return res.status(400).json({ message: "Invalid strategy mode" });
    }
    const status = await storage.updateStrategyMode(mode);
    res.json(status);
  });

  return httpServer;
}
