import aiohttp
class JupiterSwap:
    def __init__(self): self.base_url = "https://quote-api.jup.ag/v6"
    async def get_quote(self, input_mint, output_mint, amount, slippage=50):
        url = f"{self.base_url}/quote?inputMint={input_mint}&outputMint={output_mint}&amount={amount}&slippageBps={slippage}"
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp: return await resp.json()
