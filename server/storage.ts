import { db } from "./db";
import { botStatus, trades, candidates } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getBotStatus(): Promise<any>;
  getTrades(): Promise<any[]>;
  getCandidates(): Promise<any[]>;
  seedInitialData(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getBotStatus(): Promise<any> {
    const status = await db.select().from(botStatus).limit(1);
    return status[0] || { mode: "STOPPED", isRunning: false, walletBalance: "0", totalPnl: "0" };
  }

  async getTrades(): Promise<any[]> {
    return await db.select().from(trades).orderBy(desc(trades.timestamp)).limit(50);
  }

  async getCandidates(): Promise<any[]> {
    return await db.select().from(candidates).orderBy(desc(candidates.timestamp)).limit(50);
  }

  async seedInitialData(): Promise<void> {
    const existingStatus = await db.select().from(botStatus).limit(1);
    if (existingStatus.length === 0) {
      await db.insert(botStatus).values({
        mode: "SNIPER",
        isRunning: true,
        walletBalance: "12.45",
        totalPnl: "4.2",
      });

      await db.insert(trades).values([
        { tokenAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", tokenSymbol: "DOGE", type: "BUY", mode: "SNIPER", amount: "1000", price: "0.0001", pnl: "0" },
        { tokenAddress: "A9mUU4qviSctCGNtg336DpeUDB9qQ2EwA2mP5Bq5pump", tokenSymbol: "PEPE", type: "SELL", mode: "MG", amount: "5000", price: "0.00015", pnl: "0.5" },
        { tokenAddress: "B8mUU4qviSctCGNtg336DpeUDB9qQ2EwA2mP5Bq5pump", tokenSymbol: "BONK", type: "BUY", mode: "HWR", amount: "10000", price: "0.00005", pnl: "0" },
      ]);

      await db.insert(candidates).values([
        { tokenAddress: "C8mUU4qviSctCGNtg336DpeUDB9qQ2EwA2mP5Bq5pump", tokenSymbol: "WIF", liquidity: "120000", pumpProbability: "0.85", ageSeconds: 45 },
        { tokenAddress: "D8mUU4qviSctCGNtg336DpeUDB9qQ2EwA2mP5Bq5pump", tokenSymbol: "BOME", liquidity: "180000", pumpProbability: "0.72", ageSeconds: 110 },
      ]);
    }
  }
}

export const storage = new DatabaseStorage();
