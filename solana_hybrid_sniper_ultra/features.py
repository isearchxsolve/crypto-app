class FeatureEngineer:
    def compute_features(self, raw_data):
        features = {}
        # Standard
        features['ema3'] = 0
        features['ema5'] = 0
        features['ema10'] = 0
        features['rsi'] = 50
        # Sniper Features
        features['token_age_seconds'] = raw_data.get('age', 0)
        features['micro_pullback'] = False
        return features
