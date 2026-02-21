import pickle

class Predictor:
    def __init__(self, model_path="model.pkl"):
        # self.model = pickle.load(open(model_path, "rb"))
        pass

    def predict(self, features):
        return {"pump_probability": 0.65, "dump_risk": 0.20}
