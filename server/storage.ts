import { db } from "./db";
import { botStatus, trades, candidates } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getBotStatus(): Promise<any>;
  getTrades(): Promise<any[]>;
  getCandidates(): Promise<any[]>;
  updateTradingMode(mode: string): Promise<any>;
  updateBotRunning(isRunning: boolean): Promise<any>;
  updateStrategyMode(mode: string): Promise<any>;
  seedInitialData(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getBotStatus(): Promise<any> {
    const status = await db.select().from(botStatus).limit(1);
    return status[0] || { mode: "STOPPED", tradingMode: "paper", isRunning: false, walletBalance: "0", totalPnl: "0", winRate: "0", totalTrades: 0 };
  }

  async getTrades(): Promise<any[]> {
    return await db.select().from(trades).orderBy(desc(trades.timestamp)).limit(50);
  }

  async getCandidates(): Promise<any[]> {
    return await db.select().from(candidates).orderBy(desc(candidates.timestamp)).limit(50);
  }

  async updateTradingMode(mode: string): Promise<any> {
    const existing = await db.select().from(botStatus).limit(1);
    if (existing.length > 0) {
      await db.update(botStatus).set({ tradingMode: mode, lastUpdate: new Date() }).where(eq(botStatus.id, existing[0].id));
    }
    return this.getBotStatus();
  }

  async updateBotRunning(isRunning: boolean): Promise<any> {
    const existing = await db.select().from(botStatus).limit(1);
    if (existing.length > 0) {
      await db.update(botStatus).set({ isRunning, lastUpdate: new Date() }).where(eq(botStatus.id, existing[0].id));
    }
    return this.getBotStatus();
  }

  async updateStrategyMode(mode: string): Promise<any> {
    const existing = await db.select().from(botStatus).limit(1);
    if (existing.length > 0) {
      await db.update(botStatus).set({ mode, lastUpdate: new Date() }).where(eq(botStatus.id, existing[0].id));
    }
    return this.getBotStatus();
  }

  async seedInitialData(): Promise<void> {
    const existingStatus = await db.select().from(botStatus).limit(1);
    if (existingStatus.length === 0) {
      await db.insert(botStatus).values({
        mode: "SNIPER",
        tradingMode: "paper",
        isRunning: true,
        walletBalance: "12.45",
        totalPnl: "18.7",
        winRate: "72.5",
        totalTrades: 47,
      });

      await db.insert(trades).values([
        { tokenAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", tokenSymbol: "DOGE", type: "BUY", mode: "SNIPER", tradingMode: "paper", amount: "2.5", price: "0.00034", pnl: "45.2", txHash: "sim_7xK3d..." },
        { tokenAddress: "A9mUU4qviSctCGNtg336DpeUDB9qQ2EwA2mP5Bq5pump", tokenSymbol: "PEPE", type: "SELL", mode: "MG", tradingMode: "paper", amount: "1.8", price: "0.00015", pnl: "12.8", exitPrice: "0.000169", txHash: "sim_A9m5p..." },
        { tokenAddress: "B8mUU4qviSctCGNtg336DpeUDB9qQ2EwA2mP5Bq5pump", tokenSymbol: "BONK", type: "BUY", mode: "HWR", tradingMode: "paper", amount: "3.0", price: "0.00005", pnl: "8.3", txHash: "sim_B8m5p..." },
        { tokenAddress: "C3mUU4qviSctCGNtg336DpeUDB9qQ2EwA2mP5Bq5pump", tokenSymbol: "WIF", type: "SELL", mode: "SNIPER", tradingMode: "paper", amount: "5.0", price: "2.45", pnl: "-3.2", exitPrice: "2.37", txHash: "sim_C3m5p..." },
        { tokenAddress: "D4mUU4qviSctCGNtg336DpeUDB9qQ2EwA2mP5Bq5pump", tokenSymbol: "BOME", type: "BUY", mode: "MG", tradingMode: "paper", amount: "1.2", price: "0.0089", pnl: "22.1", txHash: "sim_D4m5p..." },
      ]);

      await db.insert(candidates).values([
        { tokenAddress: "C8mUU4qviSctCGNtg336DpeUDB9qQ2EwA2mP5Bq5pump", tokenSymbol: "WIF", liquidity: "120000", pumpProbability: "0.85", dumpRisk: "0.12", ageSeconds: 45, qualifiedMode: "SNIPER" },
        { tokenAddress: "D8mUU4qviSctCGNtg336DpeUDB9qQ2EwA2mP5Bq5pump", tokenSymbol: "BOME", liquidity: "180000", pumpProbability: "0.72", dumpRisk: "0.28", ageSeconds: 110, qualifiedMode: "MG" },
        { tokenAddress: "E8mUU4qviSctCGNtg336DpeUDB9qQ2EwA2mP5Bq5pump", tokenSymbol: "MYRO", liquidity: "95000", pumpProbability: "0.91", dumpRisk: "0.08", ageSeconds: 22, qualifiedMode: "SNIPER" },
        { tokenAddress: "F8mUU4qviSctCGNtg336DpeUDB9qQ2EwA2mP5Bq5pump", tokenSymbol: "POPCAT", liquidity: "340000", pumpProbability: "0.88", dumpRisk: "0.15", ageSeconds: 180, qualifiedMode: "HWR" },
      ]);
    }
  }
}

export const storage = new DatabaseStorage();
