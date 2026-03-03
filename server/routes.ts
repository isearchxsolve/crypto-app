import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";

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
