import sys
import os
import random
from datetime import datetime, timedelta

# Add app to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
import numpy as np
from app.database import init_db, add_candidate_history, get_candidates_count
from app.feature_pipeline import extract_features_df
from app.ml_model import ml_model_service

def run_ml_pipeline_test():
    print("[TEST] Starting Automated Machine Learning Pipeline Verification...")
    
    # 1. Initialize DB
    init_db()
    
    # 2. Test Feature Extraction
    print("Testing feature extraction pipeline...")
    dates = [datetime(2026, 7, 16) + timedelta(minutes=15 * idx) for idx in range(100)]
    df_raw = pd.DataFrame({
        "datetime": dates,
        "open": np.random.uniform(2340.0, 2360.0, 100),
        "high": np.random.uniform(2360.0, 2380.0, 100),
        "low": np.random.uniform(2320.0, 2340.0, 100),
        "close": np.random.uniform(2340.0, 2360.0, 100),
        "volume": np.random.randint(100, 2000, 100)
    })
    
    df_features = extract_features_df(df_raw)
    assert not df_features.empty
    assert "ema_dist_9" in df_features.columns
    assert "body_wick_ratio" in df_features.columns
    assert "recent_streak_winrate" in df_features.columns
    print("[PASS] Feature extraction pipeline validated.")

    # 3. Seed Candidates for Training Validation
    print("Seeding candidate datasets for model training validation...")
    initial_count = get_candidates_count()
    if initial_count < 210:
        for idx in range(210 - initial_count):
            c_time = datetime.utcnow() - timedelta(hours=(220 - idx))
            
            # Synthetic features
            feats = {
                "ema_dist_9": random.gauss(0.0, 0.002),
                "ema_dist_21": random.gauss(0.0, 0.004),
                "ema_dist_50": random.gauss(0.0, 0.008),
                "ema_dist_200": random.gauss(0.002, 0.015),
                "atr_relative": random.uniform(0.0005, 0.0025),
                "body_wick_ratio": random.uniform(0.1, 0.8),
                "top_wick_ratio": random.uniform(0.05, 0.4),
                "bottom_wick_ratio": random.uniform(0.05, 0.4),
                "rsi_14": random.uniform(0.3, 0.7),
                "rsi_change": random.gauss(0, 0.05),
                "roc_3": random.gauss(0, 0.005),
                "roc_12": random.gauss(0.0001, 0.01),
                "hour_utc": random.uniform(0, 1),
                "day_of_week": random.uniform(0, 1),
                "is_ny_session": float(random.choice([0, 1])),
                "is_asian_session": float(random.choice([0, 1])),
                "dxy_trend_proxy": random.gauss(0, 0.02),
                "recent_streak_winrate": random.choice([0.0, 0.33, 0.66, 1.0])
            }
            outcome = random.choice([0, 1])
            candidate = {
                "pair": "XAUUSD",
                "direction": random.choice(["BUY", "SELL"]),
                "entry_price": 2350.0 + random.gauss(0, 10),
                "stop_loss": 2345.0,
                "take_profit": 2365.0,
                "timestamp": c_time.isoformat()
            }
            add_candidate_history(candidate, feats, outcome)
            
    print(f"[PASS] Candidates history contains {get_candidates_count()} rows.")

    # 4. Fit and Evaluate Model
    print("Testing ML training run (RandomForest)...")
    report = ml_model_service.train_active_model()
    assert report is not None
    assert "version" in report
    assert "accuracy" in report
    assert "feature_importances" in report
    print("[PASS] Model training run successfully completed.")

    # 5. Model Inference Probability Checks
    print("Testing live probability inference checks...")
    sample_feat = {
        "ema_dist_9": 0.001,
        "ema_dist_21": 0.002,
        "ema_dist_50": 0.003,
        "ema_dist_200": 0.005,
        "atr_relative": 0.0012,
        "body_wick_ratio": 0.45,
        "top_wick_ratio": 0.15,
        "bottom_wick_ratio": 0.2,
        "rsi_14": 0.55,
        "rsi_change": 0.01,
        "roc_3": 0.002,
        "roc_12": 0.005,
        "hour_utc": 0.6,
        "day_of_week": 0.4,
        "is_ny_session": 1.0,
        "is_asian_session": 0.0,
        "dxy_trend_proxy": -0.01,
        "recent_streak_winrate": 0.66
    }
    
    prob, version = ml_model_service.predict_probability(sample_feat)
    assert 0.0 <= prob <= 1.0
    assert version == ml_model_service.model_version
    print(f"[PASS] Prediction probability computed successfully: {prob * 100:.1f}% using version: {version}")
    
    print("[SUCCESS] All Automated ML Pipeline Tests Passed Successfully!")

if __name__ == "__main__":
    run_ml_pipeline_test()
