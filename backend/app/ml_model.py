import os
import joblib
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, Any, List, Tuple, Optional
import xgboost as xgb
from sklearn.metrics import accuracy_score, precision_score, recall_score

from app.database import register_model, get_latest_model_meta, get_candidates_data, get_candidates_count

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_FILE_PATH = os.path.join(MODEL_DIR, "active_model.joblib")

# Threshold minimum candidate dataset size to train model
MIN_TRAINING_SAMPLES = 200

class MLModelService:
    def __init__(self):
        self._model: Optional[xgb.XGBClassifier] = None
        self.model_version: str = "N/A"
        self._load_active_model()

    def _load_active_model(self) -> bool:
        """Attempt to load the pre-trained model from disk."""
        if os.path.exists(MODEL_FILE_PATH):
            try:
                self._model = joblib.load(MODEL_FILE_PATH)
                meta = get_latest_model_meta()
                if meta:
                    self.model_version = meta["version"]
                else:
                    self.model_version = "v1.0.0"
                print(f"ML Model: Loaded XGBoost model {self.model_version} from disk.")
                return True
            except Exception as e:
                print(f"ML Model: Error loading model from disk: {e}")
        return False

    def predict_probability(self, features: Dict[str, float]) -> Tuple[float, str]:
        """
        Compute predicted win probability for a live candidate setup.
        Returns: (probability, model_version)
        """
        if self._model is None:
            # Try reloading in case it was just trained
            if not self._load_active_model():
                return 0.5, "NO_MODEL"  # Neutral baseline probability if model doesn't exist yet
                
        try:
            # Ensure features are in the correct shape (sorted keys)
            sorted_keys = sorted(features.keys())
            x_input = [features[k] for k in sorted_keys]
            
            # Predict probability of class 1 (win)
            prob = self._model.predict_proba([x_input])[0][1]
            return float(prob), self.model_version
        except Exception as e:
            print(f"ML Model: Prediction failed: {e}")
            return 0.5, "ERROR"

    def train_active_model(self) -> Dict[str, Any]:
        """
        Fetch logged candidates, perform chronological split, train XGBoost model,
        persist it on disk, and register it in the database models registry.
        """
        candidates_count = get_candidates_count()
        if candidates_count < MIN_TRAINING_SAMPLES:
            raise ValueError(f"Insufficient training samples. Found: {candidates_count}, Minimum needed: {MIN_TRAINING_SAMPLES}")
            
        # 1. Fetch Candidates Data
        candidates = get_candidates_data()
        
        # Sort chronologically by timestamp
        candidates = sorted(candidates, key=lambda x: x["timestamp"])
        
        # 2. Build Feature Matrix X and Labels y
        sample_features = candidates[0]["features"]
        feature_names = sorted(sample_features.keys())
        
        X_list = []
        y_list = []
        
        for c in candidates:
            # Ensure keys match exactly
            X_list.append([c["features"][k] for k in feature_names])
            y_list.append(c["outcome"])
            
        X = np.array(X_list)
        y = np.array(y_list)
        
        # 3. Chronological Train / Test Split (no random shuffling)
        split_idx = int(len(X) * 0.8) # 80% train, 20% test
        
        X_train, X_test = X[:split_idx], X[split_idx:]
        y_train, y_test = y[:split_idx], y[split_idx:]
        
        # 4. Fit Model
        model = xgb.XGBClassifier(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.05,
            random_state=42,
            eval_metric="logloss"
        )
        model.fit(X_train, y_train)
        
        # 5. Evaluate Metrics
        y_pred = model.predict(X_test)
        acc = accuracy_score(y_test, y_pred)
        prec = precision_score(y_test, y_pred, zero_division=0)
        rec = recall_score(y_test, y_pred, zero_division=0)
        
        # 6. Feature Importances mapping
        importances = model.feature_importances_
        feature_importance_dict = {feature_names[i]: float(importances[i]) for i in range(len(feature_names))}
        
        # Generate version string
        version = f"v_xgb_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
        
        # 7. Serialize model
        os.makedirs(os.path.dirname(MODEL_FILE_PATH), exist_ok=True)
        joblib.dump(model, MODEL_FILE_PATH)
        
        # Register in database
        meta = {
            "trained_at": datetime.utcnow().isoformat(),
            "data_start": candidates[0]["timestamp"],
            "data_end": candidates[-1]["timestamp"],
            "accuracy": float(acc),
            "precision": float(prec),
            "recall": float(rec),
            "feature_importances": feature_importance_dict
        }
        register_model(version, meta)
        
        # Load active model state
        self._model = model
        self.model_version = version
        
        print(f"ML Model: Retrained XGBoost model version {version} successfully. Test Acc: {acc:.2f}")
        return {
            "version": version,
            "accuracy": acc,
            "precision": prec,
            "recall": rec,
            "feature_importances": feature_importance_dict
        }

    def simulate_walk_forward_backtest(self, X: np.ndarray, y: np.ndarray, train_ratio: float = 0.5) -> np.ndarray:
        """
        Simulate walk-forward prediction over a dataset using XGBoost.
        Splits chronologically and returns predicted probabilities for out-of-sample candles.
        For index < train_idx, returns default 0.5 (neutral).
        """
        predictions = np.ones(len(X)) * 0.5
        n_samples = len(X)
        start_idx = int(n_samples * train_ratio)
        
        # Retrain rolling every 50 samples to simulate walk-forward updates
        step_size = 50
        
        for i in range(start_idx, n_samples, step_size):
            train_limit = i
            test_limit = min(i + step_size, n_samples)
            
            X_tr, y_tr = X[:train_limit], y[:train_limit]
            X_te = X[train_limit:test_limit]
            
            if len(X_tr) >= 30: # minimum required to fit a basic forest/model
                model = xgb.XGBClassifier(
                    n_estimators=50,
                    max_depth=4,
                    learning_rate=0.1,
                    random_state=42,
                    eval_metric="logloss"
                )
                model.fit(X_tr, y_tr)
                probs = model.predict_proba(X_te)[:, 1]
                predictions[train_limit:test_limit] = probs
                
        return predictions

ml_model_service = MLModelService()
