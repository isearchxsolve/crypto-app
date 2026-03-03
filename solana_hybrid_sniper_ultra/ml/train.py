import pandas as pd
import numpy as np
import xgboost as xgb
import pickle
import os
from sklearn.model_selection import cross_val_score

FEATURE_COLUMNS = [
    "age_seconds",
    "liquidity_usd",
    "volume_5m",
    "volume_1h",
    "volume_change_1m",
    "price_change_5m",
    "price_change_1h",
    "buy_pressure_5m",
    "buy_pressure_1h",
    "buy_sell_ratio",
    "tx_velocity_per_hour",
    "fdv",
    "liq_to_mcap",
]

def generate_training_data(n_samples=5000):
    np.random.seed(42)
    data = []

    for _ in range(n_samples):
        scenario = np.random.choice(["pump", "dump", "flat", "rug"], p=[0.15, 0.30, 0.40, 0.15])

        if scenario == "pump":
            age = np.random.exponential(60) + 5
            liquidity = np.random.uniform(5000, 200000)
            vol_5m = np.random.uniform(500, 50000)
            vol_1h = vol_5m * np.random.uniform(3, 15)
            vol_momentum = vol_5m / (vol_1h / 12 + 1e-9)
            price_change_5m = np.random.uniform(2, 80)
            price_change_1h = np.random.uniform(5, 200)
            buy_pressure_5m = np.random.uniform(0.6, 0.95)
            buy_pressure_1h = np.random.uniform(0.55, 0.85)
            buy_sell_ratio = np.random.uniform(1.5, 8.0)
            tx_velocity = np.random.uniform(100, 2000)
            fdv = np.random.uniform(50000, 5000000)
            liq_to_mcap = liquidity / (fdv + 1e-9)
            label = 1

        elif scenario == "dump":
            age = np.random.uniform(60, 7200)
            liquidity = np.random.uniform(1000, 500000)
            vol_5m = np.random.uniform(100, 20000)
            vol_1h = vol_5m * np.random.uniform(1, 8)
            vol_momentum = vol_5m / (vol_1h / 12 + 1e-9)
            price_change_5m = np.random.uniform(-60, -5)
            price_change_1h = np.random.uniform(-80, -10)
            buy_pressure_5m = np.random.uniform(0.1, 0.4)
            buy_pressure_1h = np.random.uniform(0.15, 0.45)
            buy_sell_ratio = np.random.uniform(0.1, 0.8)
            tx_velocity = np.random.uniform(50, 800)
            fdv = np.random.uniform(10000, 10000000)
            liq_to_mcap = liquidity / (fdv + 1e-9)
            label = 0

        elif scenario == "flat":
            age = np.random.uniform(300, 86400)
            liquidity = np.random.uniform(10000, 2000000)
            vol_5m = np.random.uniform(10, 5000)
            vol_1h = vol_5m * np.random.uniform(5, 20)
            vol_momentum = vol_5m / (vol_1h / 12 + 1e-9)
            price_change_5m = np.random.uniform(-3, 3)
            price_change_1h = np.random.uniform(-5, 5)
            buy_pressure_5m = np.random.uniform(0.4, 0.6)
            buy_pressure_1h = np.random.uniform(0.4, 0.6)
            buy_sell_ratio = np.random.uniform(0.7, 1.3)
            tx_velocity = np.random.uniform(10, 200)
            fdv = np.random.uniform(100000, 50000000)
            liq_to_mcap = liquidity / (fdv + 1e-9)
            label = 0

        else:  # rug
            age = np.random.uniform(10, 600)
            liquidity = np.random.uniform(100, 5000)
            vol_5m = np.random.uniform(1000, 100000)
            vol_1h = vol_5m * np.random.uniform(1, 5)
            vol_momentum = vol_5m / (vol_1h / 12 + 1e-9)
            price_change_5m = np.random.choice([np.random.uniform(10, 200), np.random.uniform(-90, -30)])
            price_change_1h = np.random.uniform(-95, 50)
            buy_pressure_5m = np.random.uniform(0.05, 0.95)
            buy_pressure_1h = np.random.uniform(0.1, 0.5)
            buy_sell_ratio = np.random.uniform(0.05, 2.0)
            tx_velocity = np.random.uniform(200, 5000)
            fdv = np.random.uniform(5000, 500000)
            liq_to_mcap = liquidity / (fdv + 1e-9)
            label = 0

        noise = lambda v, pct=0.05: v * (1 + np.random.uniform(-pct, pct))

        data.append({
            "age_seconds": noise(age, 0.1),
            "liquidity_usd": noise(liquidity, 0.1),
            "volume_5m": noise(vol_5m, 0.1),
            "volume_1h": noise(vol_1h, 0.1),
            "volume_change_1m": noise(vol_momentum, 0.15),
            "price_change_5m": noise(price_change_5m, 0.1),
            "price_change_1h": noise(price_change_1h, 0.1),
            "buy_pressure_5m": np.clip(noise(buy_pressure_5m, 0.1), 0, 1),
            "buy_pressure_1h": np.clip(noise(buy_pressure_1h, 0.1), 0, 1),
            "buy_sell_ratio": noise(buy_sell_ratio, 0.15),
            "tx_velocity_per_hour": noise(tx_velocity, 0.1),
            "fdv": noise(fdv, 0.1),
            "liq_to_mcap": noise(liq_to_mcap, 0.15),
            "label": label,
        })

    return pd.DataFrame(data)


def train_model():
    print("Generating synthetic training dataset (5000 samples)...")
    df = generate_training_data(5000)

    print(f"Dataset: {len(df)} samples | Pumps: {df['label'].sum()} ({df['label'].mean()*100:.1f}%) | Non-pumps: {(1-df['label']).sum()}")

    X = df[FEATURE_COLUMNS]
    y = df["label"]

    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=3,
        gamma=0.1,
        scale_pos_weight=(1 - y.mean()) / y.mean(),
        eval_metric="logloss",
        random_state=42,
    )

    print("Training XGBoost classifier...")
    model.fit(X, y)

    scores = cross_val_score(model, X, y, cv=5, scoring="accuracy")
    print(f"Cross-validation accuracy: {scores.mean():.3f} (+/- {scores.std():.3f})")

    scores_f1 = cross_val_score(model, X, y, cv=5, scoring="f1")
    print(f"Cross-validation F1: {scores_f1.mean():.3f} (+/- {scores_f1.std():.3f})")

    importances = model.feature_importances_
    print("\nFeature Importance:")
    for feat, imp in sorted(zip(FEATURE_COLUMNS, importances), key=lambda x: -x[1]):
        print(f"  {feat:30s} {imp:.4f}")

    os.makedirs("solana_hybrid_sniper_ultra/ml", exist_ok=True)
    model_path = "solana_hybrid_sniper_ultra/ml/model.pkl"
    with open(model_path, "wb") as f:
        pickle.dump({"model": model, "features": FEATURE_COLUMNS, "version": "2.0"}, f)
    print(f"\nModel saved to {model_path}")

    csv_path = "solana_hybrid_sniper_ultra/ml/training_data.csv"
    df.to_csv(csv_path, index=False)
    print(f"Training data saved to {csv_path}")


if __name__ == "__main__":
    train_model()
