import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, Any, List
from app.config import load_settings

def extract_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Compute base indicators needed for feature extraction."""
    df = df.copy()
    
    # 1. EMAs
    df["ema_9"] = df["close"].ewm(span=9, adjust=False).mean()
    df["ema_21"] = df["close"].ewm(span=21, adjust=False).mean()
    df["ema_50"] = df["close"].ewm(span=50, adjust=False).mean()
    df["ema_200"] = df["close"].ewm(span=200, adjust=False).mean()
    
    # 2. RSI (14)
    delta = df["close"].diff()
    gain = (delta.where(delta > 0, 0)).copy()
    loss = (-delta.where(delta < 0, 0)).copy()
    avg_gain = gain.ewm(com=13, adjust=False).mean()
    avg_loss = loss.ewm(com=13, adjust=False).mean()
    rs = avg_gain / (avg_loss + 1e-10)
    df["rsi_14"] = 100 - (100 / (1 + rs))
    
    # 3. ATR (14)
    high = df["high"]
    low = df["low"]
    close_prev = df["close"].shift(1)
    tr1 = high - low
    tr2 = (high - close_prev).abs()
    tr3 = (low - close_prev).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    df["atr_14"] = tr.ewm(span=13, adjust=False).mean()
    
    return df

def extract_features_df(df: pd.DataFrame) -> pd.DataFrame:
    """
    Extract a full feature dataset from raw OHLCV.
    Used for model training and historical backtests.
    """
    df = extract_indicators(df)
    
    features = pd.DataFrame(index=df.index)
    
    # 1. Price Action Features (normalized)
    features["ema_dist_9"] = (df["close"] - df["ema_9"]) / df["close"]
    features["ema_dist_21"] = (df["close"] - df["ema_21"]) / df["close"]
    features["ema_dist_50"] = (df["close"] - df["ema_50"]) / df["close"]
    features["ema_dist_200"] = (df["close"] - df["ema_200"]) / df["close"]
    
    features["atr_relative"] = df["atr_14"] / df["close"]
    
    candle_range = df["high"] - df["low"] + 1e-10
    features["body_wick_ratio"] = (df["close"] - df["open"]).abs() / candle_range
    features["top_wick_ratio"] = (df["high"] - df[["open", "close"]].max(axis=1)) / candle_range
    features["bottom_wick_ratio"] = (df[["open", "close"]].min(axis=1) - df["low"]) / candle_range
    
    # 2. Momentum Features
    features["rsi_14"] = df["rsi_14"] / 100.0  # normalize 0-1
    features["rsi_change"] = df["rsi_14"].diff() / 100.0
    
    features["roc_3"] = (df["close"] - df["close"].shift(3)) / (df["close"].shift(3) + 1e-10)
    features["roc_12"] = (df["close"] - df["close"].shift(12)) / (df["close"].shift(12) + 1e-10)
    
    # 3. Session / Time Features
    datetimes = pd.to_datetime(df["datetime"])
    features["hour_utc"] = datetimes.dt.hour / 24.0
    features["day_of_week"] = datetimes.dt.dayofweek / 7.0
    
    # Session overlays
    features["is_ny_session"] = datetimes.dt.hour.between(13, 20).astype(float)
    features["is_asian_session"] = datetimes.dt.hour.between(0, 7).astype(float)
    
    # 4. Correlation / Ticks (Simulated DXY correlation value)
    # Gold (XAUUSD) has a typical inverse relationship to DXY.
    # We generate a correlation metric using session and time context
    features["dxy_trend_proxy"] = np.sin(features["hour_utc"] * 2 * np.pi) * 0.05
    
    # 5. Streak Effect Proxy (Mocked as neutral 0.5 in historical training, updated in live tracking)
    features["recent_streak_winrate"] = 0.5
    
    # Add timestamp index for chronological alignment
    features["datetime"] = df["datetime"]
    
    # Clean up NaNs created by shifts/diffs
    features = features.dropna().reset_index(drop=True)
    return features

def extract_latest_features(df_m15: pd.DataFrame, recent_streak: float = 0.5) -> Dict[str, float]:
    """
    Extract a single feature vector from the latest M15 candles for live prediction.
    """
    # Calculate indicators
    df_feat = extract_features_df(df_m15)
    if df_feat.empty:
        return {}
        
    latest_row = df_feat.iloc[-1].to_dict()
    # Inject active streak parameter
    latest_row["recent_streak_winrate"] = recent_streak
    
    # Remove datetime column for training input consistency
    if "datetime" in latest_row:
        del latest_row["datetime"]
        
    return latest_row
