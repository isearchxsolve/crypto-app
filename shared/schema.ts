import { pgTable, text, serial, integer, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const botStatus = pgTable("bot_status", {
  id: serial("id").primaryKey(),
  mode: text("mode").notNull(), // SNIPER, MG, HWR
  isRunning: boolean("is_running").default(false),
  walletBalance: numeric("wallet_balance").default("0"),
  totalPnl: numeric("total_pnl").default("0"),
  lastUpdate: timestamp("last_update").defaultNow(),
});

export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  tokenAddress: text("token_address").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  type: text("type").notNull(), // BUY, SELL
  mode: text("mode").notNull(), // SNIPER, MG, HWR
  amount: numeric("amount").notNull(),
  price: numeric("price").notNull(),
  pnl: numeric("pnl"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const candidates = pgTable("candidates", {
  id: serial("id").primaryKey(),
  tokenAddress: text("token_address").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  liquidity: numeric("liquidity").notNull(),
  pumpProbability: numeric("pump_probability").notNull(),
  ageSeconds: integer("age_seconds").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertBotStatusSchema = createInsertSchema(botStatus);
export const insertTradeSchema = createInsertSchema(trades);
export const insertCandidateSchema = createInsertSchema(candidates);

export type BotStatus = typeof botStatus.$inferSelect;
export type Trade = typeof trades.$inferSelect;
export type Candidate = typeof candidates.$inferSelect;
