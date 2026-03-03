import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";

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

const TAKE_PROFIT = 25;
const STOP_LOSS = -15;
const MAX_HOLD_SECONDS = 300;
const MAX_OPEN_POSITIONS = 5;
const STARTING_BALANCE = 10;
const SCAN_INTERVAL_MS = 15000;
const PRICE_CHECK_INTERVAL_MS = 10000;

let liveCandidatesCache: any[] = [];
let lastScanTime = 0;
let tradedAddresses = new Set<string>();
let scannerInterval: ReturnType<typeof setInterval> | null = null;
let priceCheckerInterval: ReturnType<typeof setInterval> | null = null;
let paperBalance = STARTING_BALANCE;
let balanceInitialized = false;

async function fetchTokenPrice(tokenAddress: string): Promise<{ price: number; pair: DexScreenerPair | null }> {
  try {
    const resp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    if (!resp.ok) return { price: 0, pair: null };
    const data = await resp.json() as { pairs?: DexScreenerPair[] };
    if (!data.pairs || data.pairs.length === 0) return { price: 0, pair: null };
    const solanaPairs = data.pairs.filter((p: DexScreenerPair) => p.chainId === "solana");
    if (solanaPairs.length === 0) return { price: 0, pair: null };
    const best = solanaPairs.reduce((a: DexScreenerPair, b: DexScreenerPair) =>
      ((a.liquidity?.usd || 0) > (b.liquidity?.usd || 0) ? a : b)
    );
    return { price: parseFloat(best.priceUsd || "0"), pair: best };
  } catch {
    return { price: 0, pair: null };
  }
}

function evaluateToken(pair: DexScreenerPair): { shouldBuy: boolean; pumpProb: number; dumpRisk: number; qualifiedMode: string | null; signal: any } {
  const liq = pair.liquidity?.usd || 0;
  const createdAt = pair.pairCreatedAt || Date.now();
  const ageSeconds = Math.floor((Date.now() - createdAt) / 1000);
  const m5buys = pair.txns?.m5?.buys || 0;
  const m5sells = pair.txns?.m5?.sells || 0;
  const h1buys = pair.txns?.h1?.buys || 0;
  const h1sells = pair.txns?.h1?.sells || 0;
  const buyPressure5m = (m5buys + m5sells) > 0 ? m5buys / (m5buys + m5sells) : 0.5;
  const buyRatio = h1buys / (h1sells + 0.001);
  const priceChange5m = pair.priceChange?.m5 || 0;
  const priceChange1h = pair.priceChange?.h1 || 0;
  const vol5m = pair.volume?.m5 || 0;
  const vol1h = pair.volume?.h1 || 0;
  const volMomentum = vol1h > 0 ? vol5m / (vol1h / 12) : 0;
  const txVelocity = (m5buys + m5sells) * 12;

  if (liq < 500) return { shouldBuy: false, pumpProb: 0, dumpRisk: 1, qualifiedMode: null, signal: null };

  let pumpProb = 0.3;
  if (buyRatio > 1.5) pumpProb += 0.2;
  if (buyPressure5m > 0.6) pumpProb += 0.15;
  if (priceChange5m > 5) pumpProb += 0.1;
  if (priceChange1h > 10) pumpProb += 0.1;
  if (ageSeconds < 300) pumpProb += 0.1;
  if (liq < 1000) pumpProb -= 0.2;
  if (priceChange5m < -10) pumpProb -= 0.15;
  if (buyPressure5m < 0.35) pumpProb -= 0.15;
  pumpProb = Math.max(0.05, Math.min(0.95, pumpProb));
  const dumpRisk = 1 - pumpProb;

  let qualifiedMode: string | null = null;
  let sizeSol = 0;
  let slippage = 2;

  if (ageSeconds < 120 && liq > 500 && liq < 100000 && pumpProb > 0.6 && buyPressure5m > 0.55) {
    qualifiedMode = "SNIPER";
    sizeSol = Math.min(1.0, liq / 50000);
    slippage = liq < 20000 ? 15 : 10;
  } else if (pumpProb > 0.7 && volMomentum > 1.5 && priceChange5m > 3 && txVelocity > 50) {
    qualifiedMode = "MG";
    sizeSol = Math.min(0.5, liq / 100000);
    slippage = 5;
  } else if (pumpProb > 0.8 && dumpRisk < 0.25 && buyPressure5m > 0.6 && liq > 10000) {
    qualifiedMode = "HWR";
    sizeSol = Math.min(0.3, liq / 200000);
    slippage = 2;
  }

  const shouldBuy = qualifiedMode !== null && sizeSol > 0.01;
  sizeSol = Math.max(0.01, Math.round(sizeSol * 1000) / 1000);

  return {
    shouldBuy,
    pumpProb,
    dumpRisk,
    qualifiedMode,
    signal: shouldBuy ? { sizeSol, slippage, ageSeconds, liq, vol5m, priceChange5m, buyPressure5m } : null,
  };
}

async function fetchDexScreenerCandidates(): Promise<any[]> {
  const now = Date.now();
  if (now - lastScanTime < 8000 && liveCandidatesCache.length > 0) {
    return liveCandidatesCache;
  }

  try {
    const profilesResp = await fetch("https://api.dexscreener.com/token-profiles/latest/v1");
    if (!profilesResp.ok) return liveCandidatesCache;
    const profiles = await profilesResp.json() as { chainId: string; tokenAddress: string }[];
    const solanaTokens = profiles.filter((t) => t.chainId === "solana").slice(0, 6);

    let searchPairs: DexScreenerPair[] = [];
    try {
      const searchResp = await fetch("https://api.dexscreener.com/latest/dex/search?q=pump");
      if (searchResp.ok) {
        const searchData = await searchResp.json() as { pairs?: DexScreenerPair[] };
        if (searchData.pairs) {
          searchPairs = searchData.pairs
            .filter((p) => p.chainId === "solana" && (p.liquidity?.usd || 0) > 1000)
            .slice(0, 6);
        }
      }
    } catch {}

    const results: any[] = [];
    const seenAddresses = new Set<string>();

    for (const sp of searchPairs) {
      const addr = sp.baseToken.address;
      if (seenAddresses.has(addr)) continue;
      seenAddresses.add(addr);

      const eval_ = evaluateToken(sp);
      const liq = sp.liquidity?.usd || 0;
      const createdAt = sp.pairCreatedAt || Date.now();
      const ageSeconds = Math.floor((Date.now() - createdAt) / 1000);

      results.push({
        tokenAddress: addr,
        tokenSymbol: sp.baseToken.symbol,
        tokenName: sp.baseToken.name,
        dex: sp.dexId,
        price: sp.priceUsd || "0",
        liquidity: liq.toFixed(0),
        pumpProbability: eval_.pumpProb.toFixed(3),
        dumpRisk: eval_.dumpRisk.toFixed(3),
        ageSeconds,
        qualifiedMode: eval_.qualifiedMode,
        volume5m: (sp.volume?.m5 || 0).toFixed(0),
        volume1h: (sp.volume?.h1 || 0).toFixed(0),
        volume24h: (sp.volume?.h24 || 0).toFixed(0),
        priceChange5m: sp.priceChange?.m5 || 0,
        priceChange1h: sp.priceChange?.h1 || 0,
        buys5m: sp.txns?.m5?.buys || 0,
        sells5m: sp.txns?.m5?.sells || 0,
        buys1h: sp.txns?.h1?.buys || 0,
        sells1h: sp.txns?.h1?.sells || 0,
        buyPressure5m: eval_.signal?.buyPressure5m?.toFixed(3) || "0.500",
        fdv: sp.fdv || 0,
        marketCap: sp.marketCap || 0,
        source: "dexscreener_live",
        timestamp: new Date().toISOString(),
      });
    }

    for (const profile of solanaTokens) {
      if (seenAddresses.has(profile.tokenAddress)) continue;
      try {
        const { price, pair } = await fetchTokenPrice(profile.tokenAddress);
        if (!pair) continue;

        const eval_ = evaluateToken(pair);
        const liq = pair.liquidity?.usd || 0;
        const createdAt = pair.pairCreatedAt || Date.now();
        const ageSeconds = Math.floor((Date.now() - createdAt) / 1000);

        results.push({
          tokenAddress: pair.baseToken.address,
          tokenSymbol: pair.baseToken.symbol,
          tokenName: pair.baseToken.name,
          dex: pair.dexId,
          price: pair.priceUsd || "0",
          liquidity: liq.toFixed(0),
          pumpProbability: eval_.pumpProb.toFixed(3),
          dumpRisk: eval_.dumpRisk.toFixed(3),
          ageSeconds,
          qualifiedMode: eval_.qualifiedMode,
          volume5m: (pair.volume?.m5 || 0).toFixed(0),
          volume1h: (pair.volume?.h1 || 0).toFixed(0),
          volume24h: (pair.volume?.h24 || 0).toFixed(0),
          priceChange5m: pair.priceChange?.m5 || 0,
          priceChange1h: pair.priceChange?.h1 || 0,
          buys5m: pair.txns?.m5?.buys || 0,
          sells5m: pair.txns?.m5?.sells || 0,
          buys1h: pair.txns?.h1?.buys || 0,
          sells1h: pair.txns?.h1?.sells || 0,
          buyPressure5m: eval_.signal?.buyPressure5m?.toFixed(3) || "0.500",
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

async function initBalanceFromDB() {
  if (balanceInitialized) return;
  const status = await storage.getBotStatus();
  const storedBalance = parseFloat(status.walletBalance || "0");
  if (storedBalance > 0) {
    paperBalance = storedBalance;
    console.log(`[ENGINE] Restored wallet balance from DB: ${paperBalance.toFixed(3)} SOL`);
  }
  const openTrades = await storage.getOpenTrades();
  for (const t of openTrades) {
    tradedAddresses.add(t.tokenAddress);
  }
  balanceInitialized = true;
}

async function runScanCycle() {
  try {
    await initBalanceFromDB();

    const status = await storage.getBotStatus();
    if (!status.isRunning) return;

    const openTrades = await storage.getOpenTrades();
    if (openTrades.length >= MAX_OPEN_POSITIONS) return;

    const candidates = await fetchDexScreenerCandidates();

    const openAddresses = new Set(openTrades.map((t: any) => t.tokenAddress));
    let currentOpenCount = openTrades.length;

    for (const candidate of candidates) {
      if (tradedAddresses.has(candidate.tokenAddress)) continue;
      if (openAddresses.has(candidate.tokenAddress)) continue;
      if (currentOpenCount >= MAX_OPEN_POSITIONS) break;

      const { price, pair } = await fetchTokenPrice(candidate.tokenAddress);
      if (!pair || price <= 0) continue;

      const eval_ = evaluateToken(pair);
      if (!eval_.shouldBuy || !eval_.signal) continue;

      if (paperBalance < eval_.signal.sizeSol) continue;

      paperBalance -= eval_.signal.sizeSol;
      tradedAddresses.add(candidate.tokenAddress);
      openAddresses.add(candidate.tokenAddress);
      currentOpenCount++;

      await storage.addTrade({
        tokenAddress: candidate.tokenAddress,
        tokenSymbol: candidate.tokenSymbol,
        type: "BUY",
        mode: eval_.qualifiedMode || "AUTO",
        tradingMode: status.tradingMode || "paper",
        status: "OPEN",
        amount: eval_.signal.sizeSol.toFixed(3),
        price: price.toString(),
        currentPrice: price.toString(),
        pnl: "0",
        txHash: `paper_${Date.now().toString(36)}_${candidate.tokenAddress.substring(0, 6)}`,
      });

      console.log(`[TRADE] BUY $${candidate.tokenSymbol} @ $${price.toFixed(8)} | ${eval_.qualifiedMode} | Size: ${eval_.signal.sizeSol} SOL | Balance: ${paperBalance.toFixed(3)}`);

      const allTrades = await storage.getTrades();
      const closedTrades = allTrades.filter((t: any) => t.status === "CLOSED");
      const wins = closedTrades.filter((t: any) => parseFloat(t.pnl || "0") > 0).length;
      const wr = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(1) : "0";

      await storage.updateBotStats({
        walletBalance: paperBalance.toFixed(3),
        totalTrades: allTrades.length,
        openPositions: currentOpenCount,
        winRate: wr,
        lastSignal: `BUY $${candidate.tokenSymbol} via ${eval_.qualifiedMode}`,
      });

      break;
    }
  } catch (e) {
    console.error("[SCANNER] Error:", e);
  }
}

async function checkOpenPositions() {
  try {
    const openTrades = await storage.getOpenTrades();
    if (openTrades.length === 0) return;

    for (const trade of openTrades) {
      const { price: currentPrice } = await fetchTokenPrice(trade.tokenAddress);
      if (currentPrice <= 0) continue;

      const entryPrice = parseFloat(trade.price);
      if (entryPrice <= 0) continue;

      const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
      const holdTime = (Date.now() - new Date(trade.timestamp).getTime()) / 1000;

      await storage.updateTradeCurrentPrice(trade.id, currentPrice.toString(), pnlPct.toFixed(2));

      let shouldClose = false;
      let reason = "";

      if (pnlPct >= TAKE_PROFIT) {
        shouldClose = true;
        reason = "TAKE_PROFIT";
      } else if (pnlPct <= STOP_LOSS) {
        shouldClose = true;
        reason = "STOP_LOSS";
      } else if (holdTime > MAX_HOLD_SECONDS) {
        shouldClose = true;
        reason = "MAX_HOLD_TIME";
      }

      if (shouldClose) {
        const sizeSol = parseFloat(trade.amount);
        const returnSol = sizeSol * (1 + pnlPct / 100);
        paperBalance += returnSol;

        await storage.closeTrade(trade.id, currentPrice.toString(), pnlPct.toFixed(2));
        tradedAddresses.delete(trade.tokenAddress);

        console.log(`[TRADE] SELL $${trade.tokenSymbol} @ $${currentPrice.toFixed(8)} | PNL: ${pnlPct.toFixed(2)}% | Reason: ${reason} | Balance: ${paperBalance.toFixed(3)}`);

        const allTrades = await storage.getTrades();
        const closedTrades = allTrades.filter((t: any) => t.status === "CLOSED");
        const wins = closedTrades.filter((t: any) => parseFloat(t.pnl || "0") > 0).length;
        const totalPnl = closedTrades.reduce((sum: number, t: any) => sum + parseFloat(t.pnl || "0"), 0);
        const wr = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(1) : "0";
        const openNow = allTrades.filter((t: any) => t.status === "OPEN").length;

        await storage.updateBotStats({
          walletBalance: paperBalance.toFixed(3),
          totalPnl: (totalPnl / Math.max(closedTrades.length, 1)).toFixed(2),
          winRate: wr,
          totalTrades: allTrades.length,
          openPositions: openNow,
          lastSignal: `SELL $${trade.tokenSymbol} (${reason}: ${pnlPct.toFixed(1)}%)`,
        });
      }
    }
  } catch (e) {
    console.error("[POSITION_MANAGER] Error:", e);
  }
}

function startTradingEngine() {
  if (scannerInterval) clearInterval(scannerInterval);
  if (priceCheckerInterval) clearInterval(priceCheckerInterval);

  console.log("[ENGINE] Starting trading engine...");
  console.log(`[ENGINE] Take Profit: +${TAKE_PROFIT}% | Stop Loss: ${STOP_LOSS}% | Max Hold: ${MAX_HOLD_SECONDS}s`);
  console.log(`[ENGINE] Max Positions: ${MAX_OPEN_POSITIONS} | Starting Balance: ${STARTING_BALANCE} SOL`);

  scannerInterval = setInterval(runScanCycle, SCAN_INTERVAL_MS);
  priceCheckerInterval = setInterval(checkOpenPositions, PRICE_CHECK_INTERVAL_MS);

  setTimeout(runScanCycle, 3000);
  setTimeout(checkOpenPositions, 8000);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  await storage.seedInitialData();

  startTradingEngine();

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

  app.get("/api/trades/open", async (_req, res) => {
    const open = await storage.getOpenTrades();
    res.json(open);
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
