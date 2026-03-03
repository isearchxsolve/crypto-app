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

const TRAILING_STOP_ACTIVATION = 8;
const TRAILING_STOP_DISTANCE = 5;
const HARD_TAKE_PROFIT = 50;
const STOP_LOSS = -12;
const MAX_HOLD_SECONDS = 600;
const MAX_OPEN_POSITIONS = 8;
const STARTING_BALANCE = 10;
const SCAN_INTERVAL_MS = 10000;
const PRICE_CHECK_INTERVAL_MS = 5000;
const MIN_SCORE_TO_TRADE = 70;

let liveCandidatesCache: any[] = [];
let lastScanTime = 0;
let tradedAddresses = new Set<string>();
let scannerInterval: ReturnType<typeof setInterval> | null = null;
let priceCheckerInterval: ReturnType<typeof setInterval> | null = null;
let paperBalance = STARTING_BALANCE;
let balanceInitialized = false;
let peakPrices = new Map<number, number>();
let consecutiveWins = 0;
let consecutiveLosses = 0;

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

function scoreToken(pair: DexScreenerPair): {
  score: number;
  breakdown: Record<string, number>;
  metrics: Record<string, number>;
  qualifiedMode: string | null;
  sizeSol: number;
  slippage: number;
} {
  const liq = pair.liquidity?.usd || 0;
  const createdAt = pair.pairCreatedAt || Date.now();
  const ageSeconds = Math.floor((Date.now() - createdAt) / 1000);
  const m5buys = pair.txns?.m5?.buys || 0;
  const m5sells = pair.txns?.m5?.sells || 0;
  const h1buys = pair.txns?.h1?.buys || 0;
  const h1sells = pair.txns?.h1?.sells || 0;
  const h24buys = pair.txns?.h24?.buys || 0;
  const h24sells = pair.txns?.h24?.sells || 0;
  const buyPressure5m = (m5buys + m5sells) > 0 ? m5buys / (m5buys + m5sells) : 0.5;
  const buyPressure1h = (h1buys + h1sells) > 0 ? h1buys / (h1buys + h1sells) : 0.5;
  const priceChange5m = pair.priceChange?.m5 || 0;
  const priceChange1h = pair.priceChange?.h1 || 0;
  const priceChange6h = pair.priceChange?.h6 || 0;
  const priceChange24h = pair.priceChange?.h24 || 0;
  const vol5m = pair.volume?.m5 || 0;
  const vol1h = pair.volume?.h1 || 0;
  const vol24h = pair.volume?.h24 || 0;
  const volMomentum = vol1h > 0 ? (vol5m * 12) / vol1h : 0;
  const txVelocity5m = m5buys + m5sells;
  const fdv = pair.fdv || 0;
  const mcap = pair.marketCap || 0;

  if (liq < 1000) return { score: 0, breakdown: {}, metrics: {}, qualifiedMode: null, sizeSol: 0, slippage: 0 };

  let breakdown: Record<string, number> = {};

  const bpScore = buyPressure5m > 0.7 ? 20 : buyPressure5m > 0.6 ? 15 : buyPressure5m > 0.55 ? 10 : buyPressure5m > 0.5 ? 5 : 0;
  breakdown.buyPressure = bpScore;

  const vmScore = volMomentum > 3 ? 20 : volMomentum > 2 ? 15 : volMomentum > 1.5 ? 10 : volMomentum > 1 ? 5 : 0;
  breakdown.volumeMomentum = vmScore;

  let trendScore = 0;
  if (priceChange5m > 10) trendScore += 8;
  else if (priceChange5m > 5) trendScore += 6;
  else if (priceChange5m > 2) trendScore += 3;
  else if (priceChange5m < -5) trendScore -= 5;
  if (priceChange1h > 20) trendScore += 7;
  else if (priceChange1h > 10) trendScore += 5;
  else if (priceChange1h > 0) trendScore += 2;
  else if (priceChange1h < -10) trendScore -= 5;
  breakdown.trend = Math.max(0, Math.min(15, trendScore));

  const txScore = txVelocity5m > 100 ? 15 : txVelocity5m > 50 ? 12 : txVelocity5m > 20 ? 8 : txVelocity5m > 10 ? 5 : 0;
  breakdown.txVelocity = txScore;

  let liqScore = 0;
  if (liq > 50000) liqScore = 10;
  else if (liq > 20000) liqScore = 8;
  else if (liq > 5000) liqScore = 6;
  else if (liq > 2000) liqScore = 4;
  breakdown.liquidity = liqScore;

  let freshScore = 0;
  if (ageSeconds < 60) freshScore = 10;
  else if (ageSeconds < 300) freshScore = 8;
  else if (ageSeconds < 900) freshScore = 5;
  else if (ageSeconds < 3600) freshScore = 3;
  breakdown.freshness = freshScore;

  let multiTfScore = 0;
  const alignedUp = (priceChange5m > 0 ? 1 : 0) + (priceChange1h > 0 ? 1 : 0) + (priceChange6h > 0 ? 1 : 0);
  if (alignedUp >= 3) multiTfScore = 10;
  else if (alignedUp >= 2 && priceChange5m > 0) multiTfScore = 7;
  else if (alignedUp >= 2) multiTfScore = 4;
  if (priceChange5m > 0 && priceChange1h > 0 && priceChange5m > priceChange1h / 12) multiTfScore += 3;
  breakdown.multiTimeframe = Math.min(10, multiTfScore);

  const totalScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

  const metrics = {
    liq, ageSeconds, buyPressure5m, buyPressure1h, volMomentum,
    priceChange5m, priceChange1h, priceChange6h, priceChange24h,
    vol5m, vol1h, vol24h, txVelocity5m, fdv, mcap,
    m5buys, m5sells, h1buys, h1sells
  };

  let qualifiedMode: string | null = null;
  let sizeSol = 0;
  let slippage = 2;

  if (ageSeconds < 180 && totalScore >= 60 && buyPressure5m > 0.55 && liq > 1000) {
    qualifiedMode = "SNIPER";
    sizeSol = Math.min(1.5, liq / 30000);
    slippage = liq < 20000 ? 15 : 10;
  } else if (totalScore >= 70 && volMomentum > 1.5 && priceChange5m > 2 && txVelocity5m > 15) {
    qualifiedMode = "MG";
    sizeSol = Math.min(1.0, liq / 50000);
    slippage = 5;
  } else if (totalScore >= 75 && buyPressure5m > 0.6 && buyPressure1h > 0.55 && liq > 5000) {
    qualifiedMode = "HWR";
    sizeSol = Math.min(0.8, liq / 80000);
    slippage = 3;
  }

  if (totalScore >= 85) sizeSol *= 1.5;
  if (totalScore >= 90) sizeSol *= 1.3;

  if (consecutiveWins >= 3) sizeSol *= 1.2;
  if (consecutiveLosses >= 3) sizeSol *= 0.6;

  sizeSol = Math.min(2.0, Math.max(0.01, Math.round(sizeSol * 1000) / 1000));

  return { score: totalScore, breakdown, metrics, qualifiedMode, sizeSol, slippage };
}

async function fetchDexScreenerCandidates(): Promise<any[]> {
  const now = Date.now();
  if (now - lastScanTime < 6000 && liveCandidatesCache.length > 0) {
    return liveCandidatesCache;
  }

  try {
    const searchQueries = ["pump", "moon", "sol new"];
    const allPairs: DexScreenerPair[] = [];

    const fetchPromises = [
      fetch("https://api.dexscreener.com/token-profiles/latest/v1").then(r => r.ok ? r.json() : []).catch(() => []),
      ...searchQueries.map(q =>
        fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`)
          .then(r => r.ok ? r.json() : { pairs: [] })
          .catch(() => ({ pairs: [] }))
      ),
    ];

    const [profiles, ...searchResults] = await Promise.all(fetchPromises);

    for (const sr of searchResults) {
      if (sr.pairs) {
        const solanaPairs = (sr.pairs as DexScreenerPair[])
          .filter(p => p.chainId === "solana" && (p.liquidity?.usd || 0) > 1000)
          .slice(0, 10);
        allPairs.push(...solanaPairs);
      }
    }

    const solanaProfiles = ((profiles as any[]) || [])
      .filter((t: any) => t.chainId === "solana")
      .slice(0, 8);

    const results: any[] = [];
    const seenAddresses = new Set<string>();

    for (const sp of allPairs) {
      const addr = sp.baseToken.address;
      if (seenAddresses.has(addr)) continue;
      seenAddresses.add(addr);

      const scoring = scoreToken(sp);
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
        score: scoring.score,
        pumpProbability: (scoring.score / 100).toFixed(3),
        dumpRisk: (1 - scoring.score / 100).toFixed(3),
        ageSeconds,
        qualifiedMode: scoring.qualifiedMode,
        volume5m: (sp.volume?.m5 || 0).toFixed(0),
        volume1h: (sp.volume?.h1 || 0).toFixed(0),
        volume24h: (sp.volume?.h24 || 0).toFixed(0),
        priceChange5m: sp.priceChange?.m5 || 0,
        priceChange1h: sp.priceChange?.h1 || 0,
        buys5m: sp.txns?.m5?.buys || 0,
        sells5m: sp.txns?.m5?.sells || 0,
        buys1h: sp.txns?.h1?.buys || 0,
        sells1h: sp.txns?.h1?.sells || 0,
        buyPressure5m: scoring.metrics.buyPressure5m?.toFixed(3) || "0.500",
        fdv: sp.fdv || 0,
        marketCap: sp.marketCap || 0,
        source: "dexscreener_live",
        timestamp: new Date().toISOString(),
      });
    }

    for (const profile of solanaProfiles) {
      if (seenAddresses.has(profile.tokenAddress)) continue;
      try {
        const { price, pair } = await fetchTokenPrice(profile.tokenAddress);
        if (!pair) continue;

        const scoring = scoreToken(pair);
        const liq = pair.liquidity?.usd || 0;
        const createdAt = pair.pairCreatedAt || Date.now();
        const ageSeconds = Math.floor((Date.now() - createdAt) / 1000);
        seenAddresses.add(profile.tokenAddress);

        results.push({
          tokenAddress: pair.baseToken.address,
          tokenSymbol: pair.baseToken.symbol,
          tokenName: pair.baseToken.name,
          dex: pair.dexId,
          price: pair.priceUsd || "0",
          liquidity: liq.toFixed(0),
          score: scoring.score,
          pumpProbability: (scoring.score / 100).toFixed(3),
          dumpRisk: (1 - scoring.score / 100).toFixed(3),
          ageSeconds,
          qualifiedMode: scoring.qualifiedMode,
          volume5m: (pair.volume?.m5 || 0).toFixed(0),
          volume1h: (pair.volume?.h1 || 0).toFixed(0),
          volume24h: (pair.volume?.h24 || 0).toFixed(0),
          priceChange5m: pair.priceChange?.m5 || 0,
          priceChange1h: pair.priceChange?.h1 || 0,
          buys5m: pair.txns?.m5?.buys || 0,
          sells5m: pair.txns?.m5?.sells || 0,
          buys1h: pair.txns?.h1?.buys || 0,
          sells1h: pair.txns?.h1?.sells || 0,
          buyPressure5m: scoring.metrics.buyPressure5m?.toFixed(3) || "0.500",
          fdv: pair.fdv || 0,
          marketCap: pair.marketCap || 0,
          source: "dexscreener_live",
          timestamp: new Date().toISOString(),
        });
      } catch {
        continue;
      }
    }

    results.sort((a, b) => (b.score || 0) - (a.score || 0));

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
    if (t.peakPrice) {
      peakPrices.set(t.id, parseFloat(t.peakPrice));
    }
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
    let tradesThisCycle = 0;

    for (const candidate of candidates) {
      if (tradedAddresses.has(candidate.tokenAddress)) continue;
      if (openAddresses.has(candidate.tokenAddress)) continue;
      if (currentOpenCount >= MAX_OPEN_POSITIONS) break;
      if (tradesThisCycle >= 3) break;

      const { price, pair } = await fetchTokenPrice(candidate.tokenAddress);
      if (!pair || price <= 0) continue;

      const scoring = scoreToken(pair);
      if (!scoring.qualifiedMode || scoring.score < MIN_SCORE_TO_TRADE || scoring.sizeSol < 0.01) continue;

      if (status.mode !== "AUTO" && scoring.qualifiedMode !== status.mode) continue;

      if (paperBalance < scoring.sizeSol) continue;

      paperBalance -= scoring.sizeSol;
      tradedAddresses.add(candidate.tokenAddress);
      openAddresses.add(candidate.tokenAddress);
      currentOpenCount++;
      tradesThisCycle++;

      const trade = await storage.addTrade({
        tokenAddress: candidate.tokenAddress,
        tokenSymbol: candidate.tokenSymbol,
        type: "BUY",
        mode: scoring.qualifiedMode,
        tradingMode: status.tradingMode || "paper",
        status: "OPEN",
        amount: scoring.sizeSol.toFixed(3),
        price: price.toString(),
        currentPrice: price.toString(),
        peakPrice: price.toString(),
        pnl: "0",
        peakPnl: "0",
        score: scoring.score.toString(),
        txHash: `paper_${Date.now().toString(36)}_${candidate.tokenAddress.substring(0, 6)}`,
      });

      peakPrices.set(trade.id, price);

      console.log(`[SNIPER] BUY $${candidate.tokenSymbol} @ $${price.toFixed(8)} | ${scoring.qualifiedMode} | Score: ${scoring.score}/100 | Size: ${scoring.sizeSol} SOL | Bal: ${paperBalance.toFixed(3)}`);
      console.log(`  Breakdown: BP=${scoring.breakdown.buyPressure} VM=${scoring.breakdown.volumeMomentum} TR=${scoring.breakdown.trend} TX=${scoring.breakdown.txVelocity} LQ=${scoring.breakdown.liquidity} FR=${scoring.breakdown.freshness} MTF=${scoring.breakdown.multiTimeframe}`);

      const allTrades = await storage.getTrades();
      const closedTrades = allTrades.filter((t: any) => t.status === "CLOSED");
      const wins = closedTrades.filter((t: any) => parseFloat(t.pnl || "0") > 0).length;
      const wr = closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(1) : "0";

      await storage.updateBotStats({
        walletBalance: paperBalance.toFixed(3),
        totalTrades: allTrades.length,
        openPositions: currentOpenCount,
        winRate: wr,
        lastSignal: `🎯 BUY $${candidate.tokenSymbol} via ${scoring.qualifiedMode} (Score: ${scoring.score})`,
      });
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
      const { price: currentPrice, pair } = await fetchTokenPrice(trade.tokenAddress);
      if (currentPrice <= 0) continue;

      const entryPrice = parseFloat(trade.price);
      if (entryPrice <= 0) continue;

      const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
      const holdTime = (Date.now() - new Date(trade.timestamp).getTime()) / 1000;

      let peak = peakPrices.get(trade.id) || entryPrice;
      if (currentPrice > peak) {
        peak = currentPrice;
        peakPrices.set(trade.id, peak);
      }
      const peakPnl = ((peak - entryPrice) / entryPrice) * 100;
      const drawdownFromPeak = peak > 0 ? ((peak - currentPrice) / peak) * 100 : 0;

      await storage.updateTradeCurrentPrice(trade.id, currentPrice.toString(), pnlPct.toFixed(2));
      await storage.updateTradePeakPrice(trade.id, peak.toString(), peakPnl.toFixed(2));

      let shouldClose = false;
      let reason = "";

      if (pnlPct >= HARD_TAKE_PROFIT) {
        shouldClose = true;
        reason = "HARD_TP";
      } else if (peakPnl >= TRAILING_STOP_ACTIVATION && drawdownFromPeak >= TRAILING_STOP_DISTANCE) {
        shouldClose = true;
        reason = `TRAIL_STOP (peak +${peakPnl.toFixed(1)}%, fell ${drawdownFromPeak.toFixed(1)}%)`;
      } else if (pnlPct <= STOP_LOSS) {
        shouldClose = true;
        reason = "STOP_LOSS";
      } else if (holdTime > MAX_HOLD_SECONDS && pnlPct < 5) {
        shouldClose = true;
        reason = "MAX_HOLD";
      } else if (holdTime > MAX_HOLD_SECONDS / 2 && pnlPct < -5) {
        shouldClose = true;
        reason = "EARLY_CUT";
      }

      if (pair && pnlPct > 3 && holdTime > 60) {
        const m5buys = pair.txns?.m5?.buys || 0;
        const m5sells = pair.txns?.m5?.sells || 0;
        const currentBP = (m5buys + m5sells) > 0 ? m5buys / (m5buys + m5sells) : 0.5;
        const priceChange5m = pair.priceChange?.m5 || 0;
        if (currentBP < 0.35 && priceChange5m < -3) {
          shouldClose = true;
          reason = `MOMENTUM_FADE (BP=${currentBP.toFixed(2)}, Δ5m=${priceChange5m.toFixed(1)}%)`;
        }
      }

      if (shouldClose) {
        const sizeSol = parseFloat(trade.amount);
        const returnSol = sizeSol * (1 + pnlPct / 100);
        paperBalance += returnSol;

        const isWin = pnlPct > 0;
        if (isWin) {
          consecutiveWins++;
          consecutiveLosses = 0;
        } else {
          consecutiveLosses++;
          consecutiveWins = 0;
        }

        await storage.closeTrade(trade.id, currentPrice.toString(), pnlPct.toFixed(2), reason);
        tradedAddresses.delete(trade.tokenAddress);
        peakPrices.delete(trade.id);

        const emoji = isWin ? "💰" : "🔻";
        console.log(`[TRADE] ${emoji} SELL $${trade.tokenSymbol} @ $${currentPrice.toFixed(8)} | PNL: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}% | Peak: +${peakPnl.toFixed(1)}% | ${reason} | Bal: ${paperBalance.toFixed(3)}`);

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
          lastSignal: `${emoji} SOLD $${trade.tokenSymbol} | ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}% | ${reason}`,
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

  console.log("[ENGINE] ⚡ ULTRA SNIPER ENGINE v3.0 starting...");
  console.log(`[ENGINE] Trailing Stop: activates +${TRAILING_STOP_ACTIVATION}%, trails ${TRAILING_STOP_DISTANCE}% | Hard TP: +${HARD_TAKE_PROFIT}% | SL: ${STOP_LOSS}%`);
  console.log(`[ENGINE] Max Hold: ${MAX_HOLD_SECONDS}s | Max Positions: ${MAX_OPEN_POSITIONS} | Min Score: ${MIN_SCORE_TO_TRADE}/100`);
  console.log(`[ENGINE] Scan: ${SCAN_INTERVAL_MS / 1000}s | Price Check: ${PRICE_CHECK_INTERVAL_MS / 1000}s`);

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

  app.get("/api/engine/stats", async (_req, res) => {
    const allTrades = await storage.getTrades();
    const closedTrades = allTrades.filter((t: any) => t.status === "CLOSED");
    const openTrades = allTrades.filter((t: any) => t.status === "OPEN");
    const wins = closedTrades.filter((t: any) => parseFloat(t.pnl || "0") > 0);
    const losses = closedTrades.filter((t: any) => parseFloat(t.pnl || "0") <= 0);
    const avgWin = wins.length > 0 ? wins.reduce((s: number, t: any) => s + parseFloat(t.pnl || "0"), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s: number, t: any) => s + parseFloat(t.pnl || "0"), 0) / losses.length : 0;
    const totalPnlSol = closedTrades.reduce((s: number, t: any) => {
      const size = parseFloat(t.amount || "0");
      const pnl = parseFloat(t.pnl || "0");
      return s + (size * pnl / 100);
    }, 0);
    const bestTrade = closedTrades.length > 0 ? closedTrades.reduce((best: any, t: any) => parseFloat(t.pnl || "0") > parseFloat(best?.pnl || "-999") ? t : best, closedTrades[0]) : null;
    const worstTrade = closedTrades.length > 0 ? closedTrades.reduce((worst: any, t: any) => parseFloat(t.pnl || "0") < parseFloat(worst?.pnl || "999") ? t : worst, closedTrades[0]) : null;

    res.json({
      totalTrades: allTrades.length,
      closedTrades: closedTrades.length,
      openTrades: openTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: closedTrades.length > 0 ? ((wins.length / closedTrades.length) * 100).toFixed(1) : "0",
      avgWinPct: avgWin.toFixed(2),
      avgLossPct: avgLoss.toFixed(2),
      totalPnlSol: totalPnlSol.toFixed(4),
      bestTrade: bestTrade ? { symbol: bestTrade.tokenSymbol, pnl: bestTrade.pnl, mode: bestTrade.mode } : null,
      worstTrade: worstTrade ? { symbol: worstTrade.tokenSymbol, pnl: worstTrade.pnl, mode: worstTrade.mode } : null,
      consecutiveWins,
      consecutiveLosses,
      paperBalance: paperBalance.toFixed(3),
      engineVersion: "3.0",
      trailingStop: `+${TRAILING_STOP_ACTIVATION}% / -${TRAILING_STOP_DISTANCE}%`,
      hardTP: `+${HARD_TAKE_PROFIT}%`,
      stopLoss: `${STOP_LOSS}%`,
    });
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
