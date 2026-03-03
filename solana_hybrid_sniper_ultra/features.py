import numpy as np

class FeatureExtractor:
    @staticmethod
    def calculate_rsi(prices, period=14):
        if len(prices) < period + 1: return 50
        deltas = np.diff(prices)
        seed = deltas[:period+1]
        up = seed[seed >= 0].sum() / period
        down = -seed[seed < 0].sum() / period
        rs = up / down if down != 0 else 100
        return 100. - 100. / (1. + rs)

    @staticmethod
    def calculate_vov(volumes):
        if len(volumes) < 5: return 0
        return np.std(volumes[-5:]) / (np.mean(volumes[-5:]) + 1e-9)
