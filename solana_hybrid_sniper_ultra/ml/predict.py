import pickle
import os
import numpy as np
import logging

logger = logging.getLogger("Predictor")

class Predictor:
    def __init__(self):
        self.model_path = "solana_hybrid_sniper_ultra/ml/model.pkl"
        self.model = None
        self.feature_columns = None
        self.version = "1.0"
        self._load_model()

    def _load_model(self):
        if not os.path.exists(self.model_path):
            logger.warning("No trained model found. Using heuristic fallback.")
            return

        try:
            with open(self.model_path, "rb") as f:
                payload = pickle.load(f)

            if isinstance(payload, dict):
                self.model = payload["model"]
                self.feature_columns = payload["features"]
                self.version = payload.get("version", "2.0")
                logger.info(f"Loaded model v{self.version} with {len(self.feature_columns)} features")
            else:
                self.model = payload
                self.feature_columns = ["age_seconds", "liquidity_usd", "volume_change_1m"]
                self.version = "1.0"
                logger.info("Loaded legacy model v1.0")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")

    def predict(self, features):
        if not self.model:
            return self._heuristic_predict(features)

        try:
            feature_values = []
            for col in self.feature_columns:
                val = features.get(col, 0)
                if val is None:
                    val = 0
                feature_values.append(float(val))

            data = np.array([feature_values])
            prob = self.model.predict_proba(data)[0][1]

            return {
                "pump_probability": float(prob),
                "dump_risk": 1.0 - float(prob),
                "model_version": self.version,
            }
        except Exception as e:
            logger.error(f"Prediction error: {e}")
            return self._heuristic_predict(features)

    def _heuristic_predict(self, features):
        age = features.get("age_seconds", 99999)
        liq = features.get("liquidity_usd", 0)
        buy_pressure = features.get("buy_pressure_5m", 0.5)
        price_change_5m = features.get("price_change_5m", 0)
        vol_momentum = features.get("volume_change_1m", 0)

        score = 0.3

        if age < 120:
            score += 0.15
        elif age < 600:
            score += 0.05

        if 5000 < liq < 200000:
            score += 0.1

        if buy_pressure > 0.65:
            score += 0.15
        elif buy_pressure > 0.55:
            score += 0.05

        if price_change_5m > 10:
            score += 0.1
        elif price_change_5m > 3:
            score += 0.05

        if vol_momentum > 2:
            score += 0.1

        if liq < 1000:
            score -= 0.2

        score = max(0.05, min(0.95, score))

        return {
            "pump_probability": score,
            "dump_risk": 1.0 - score,
            "model_version": "heuristic",
        }
