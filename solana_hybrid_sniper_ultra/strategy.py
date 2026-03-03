class HybridStrategy:
    def __init__(self):
        self.current_mode = "SCANNING"

    def analyze(self, features, predictions):
        age = features.get('age_seconds', 0)
        liq = features.get('liquidity_usd', 0)
        pump_prob = predictions.get('pump_probability', 0)
        dump_risk = predictions.get('dump_risk', 1)
        vol_change = features.get('volume_change_1m', 0)

        if age < 120 and liq < 50000 and pump_prob > 0.65:
            self.current_mode = "SNIPER"
            return self._generate_signal("BUY", 1.0, 15.0)
        if pump_prob > 0.75 and vol_change > 2.0:
            self.current_mode = "MG"
            return self._generate_signal("BUY", 0.5, 5.0)
        if pump_prob > 0.85 and dump_risk < 0.2:
            self.current_mode = "HWR"
            return self._generate_signal("BUY", 0.2, 2.0)
        self.current_mode = "SCANNING"
        return None

    def _generate_signal(self, action, size, slippage):
        return {"action": action, "size_sol": size, "slippage": slippage, "timestamp": "now"}
