import pickle
import os
import numpy as np

class Predictor:
    def __init__(self):
        self.model_path = "solana_hybrid_sniper_ultra/ml/model.pkl"
        self.model = None
        if os.path.exists(self.model_path):
            with open(self.model_path, 'rb') as f:
                self.model = pickle.load(f)

    def predict(self, features):
        if not self.model:
            # Fallback heuristic
            return {"pump_probability": 0.5, "dump_risk": 0.5}
            
        # Real XGBoost inference
        data = np.array([[features['age_seconds'], features['liquidity_usd'], features.get('volume_change_1m', 0)]])
        prob = self.model.predict_proba(data)[0][1]
        
        return {
            "pump_probability": float(prob),
            "dump_risk": 1.0 - float(prob)
        }
