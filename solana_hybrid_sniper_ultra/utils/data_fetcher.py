import aiohttp
import time

class DataFetcher:
    def __init__(self):
        self.dex_url = "https://api.dexscreener.com/latest/dex/tokens/"

    async def get_new_listings(self):
        # Simulated stream for demonstration
        return [
            {
                "symbol": "SNIPER",
                "address": "Sniper111111111111111111111111111111111111",
                "price": 0.0005,
                "created_at": time.time() - 15,
                "liquidity": 8000
            }
        ]

    async def get_market_depth(self, address):
        return {"bids": 150, "asks": 100, "volume_24h": 25000}

    def process_features(self, token, market):
        return {
            "age_seconds": time.time() - token.get('created_at', time.time()),
            "liquidity_usd": token.get('liquidity', 0),
            "volume_change_1m": 4.5,
            "buy_sell_ratio": market['bids'] / (market['asks'] + 1)
        }
