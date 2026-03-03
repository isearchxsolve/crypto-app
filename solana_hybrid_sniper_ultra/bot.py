import asyncio
import os
import logging
import json
import time
from datetime import datetime
from dotenv import load_dotenv
from strategy import HybridStrategy
from utils.data_fetcher import DataFetcher
from ml.predict import Predictor
from executor_paper import PaperExecutor

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("solana_hybrid_sniper_ultra/logs/bot.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("SniperBot")

load_dotenv()

class SolanaSniperBot:
    def __init__(self):
        self.fetcher = DataFetcher()
        self.strategy = HybridStrategy()
        self.predictor = Predictor()
        self.executor = PaperExecutor()
        self.is_running = False
        self.mode = os.getenv("MODE", "paper")

    async def start(self):
        logger.info(f"🚀 Starting Solana Hybrid Sniper Ultra [Mode: {self.mode}]")
        self.is_running = True
        
        while self.is_running:
            try:
                tokens = await self.fetcher.get_new_listings()
                for token in tokens:
                    address = token.get('address')
                    if not address: continue
                    market_data = await self.fetcher.get_market_depth(address)
                    features = self.fetcher.process_features(token, market_data)
                    predictions = self.predictor.predict(features)
                    signal = self.strategy.analyze(features, predictions)
                    if signal and signal['action'] == 'BUY':
                        logger.info(f"🎯 SIGNAL: {token['symbol']} | Mode: {self.strategy.current_mode} | Prob: {predictions['pump_probability']:.2f}")
                        await self.executor.execute_trade(token, self.strategy.current_mode, signal)
                await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"Error in main loop: {str(e)}")
                await asyncio.sleep(5)

    def stop(self):
        self.is_running = False
        logger.info("Stopping bot...")

if __name__ == "__main__":
    bot = SolanaSniperBot()
    try:
        asyncio.run(bot.start())
    except KeyboardInterrupt:
        bot.stop()
