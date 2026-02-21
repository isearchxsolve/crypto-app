class HybridStrategy:
    def __init__(self):
        self.current_mode = "NONE"

    def determine_mode(self, token_data, predictions):
        age = token_data.get("age", 0)
        liquidity = token_data.get("liquidity", 0)
        pump_prob = predictions.get("pump_probability", 0)

        if age < 120 and liquidity < 150000 and pump_prob > 0.55:
            self.current_mode = "SNIPER"
            return self.sniper_mode(token_data)
        elif pump_prob > 0.60:
            self.current_mode = "MG"
            return self.mg_mode(token_data)
        elif pump_prob > 0.80:
            self.current_mode = "HWR"
            return self.hwr_mode(token_data)
        
        return None

    def sniper_mode(self, token_data):
        print("Executing SNIPER mode")
        pass

    def mg_mode(self, token_data):
        print("Executing MG mode")
        pass

    def hwr_mode(self, token_data):
        print("Executing HWR mode")
        pass
