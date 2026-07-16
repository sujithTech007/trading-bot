import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, Any, List
from app.config import load_settings
from app.engine import evaluate_strategy
from app.feature_pipeline import extract_features_df, extract_indicators
from app.ml_model import ml_model_service

def run_backtest(df_m15: pd.DataFrame, df_h4: pd.DataFrame) -> Dict[str, Any]:
    """
    Reworked A/B Comparative Backtester.
    Runs walk-forward ML classifiers over historical candidate triggers.
    Returns comparing metrics and dual equity curves.
    """
    settings = load_settings()
    cutoff = getattr(settings, "ml_confidence_cutoff", 0.65)
    
    # 1. Generate all baseline candidates chronologically
    candidates = []
    
    # Pre-calculate indicators for fast loops
    df_m15_feat = extract_features_df(df_m15)
    
    # We will run strategy evaluations historically
    min_idx = max(settings.trend_ema_slow * 16, settings.entry_ema_slow + 20)
    
    if len(df_m15) <= min_idx:
        return {}
        
    print("Backtest Engine: Compiling candidate setups...")
    
    # In a backtest, to make it fast, we can scan candle closes
    # and run evaluate_strategy to find triggers.
    # To prevent lookahead, we pass historical slices
    for i in range(min_idx, len(df_m15)):
        m15_row = df_m15.iloc[i]
        m15_time = m15_row["datetime"]
        
        slice_m15 = df_m15.iloc[:i+1].copy()
        slice_h4 = df_h4[df_h4["datetime"] <= m15_time].copy()
        
        # Temporarily mock ml_model to output NO_MODEL to force candidate generation
        # in evaluate_strategy (which returns candidate immediately as approved).
        # We can simulate Layer 1 rules manually or use evaluate_strategy
        # since we reresolved Layer 2 inside engine.py.
        # Let's override ml_model state during candidate scanning:
        original_model = ml_model_service._model
        ml_model_service._model = None # Forces "NO_MODEL" rule-only fallback
        
        signal = evaluate_strategy(slice_m15, slice_h4, current_time_utc=m15_time)
        
        # Restore model state
        ml_model_service._model = original_model
        
        if signal:
            candidates.append({
                "index": i,
                "timestamp": m15_time,
                "direction": signal["direction"],
                "entry_price": signal["entry_price"],
                "stop_loss": signal["stop_loss"],
                "take_profit": signal["take_profit"],
                "risk_reward": signal["risk_reward"],
                "lot_size": signal["lot_size"],
                "session": signal["session"]
            })
            
    print(f"Backtest Engine: Found {len(candidates)} technical candidate setups.")
    
    if len(candidates) < 10:
        # Too few trades to backtest or split
        return {
            "rules_only": {"win_rate": 0, "total_trades": 0, "drawdown": 0, "net_r": 0, "equity": []},
            "rules_ml": {"win_rate": 0, "total_trades": 0, "drawdown": 0, "net_r": 0, "equity": []},
            "trades": []
        }

    # 2. Determine Outcomes (Labeling: WIN=1, LOSS=0)
    labeled_candidates = []
    X_features = []
    y_labels = []
    
    for c in candidates:
        idx = c["index"]
        entry = c["entry_price"]
        sl = c["stop_loss"]
        tp = c["take_profit"]
        direction = c["direction"]
        
        # Look forward in df_m15 to find target hit
        outcome = None
        exit_price = None
        exit_time = None
        
        for k in range(idx + 1, len(df_m15)):
            f_row = df_m15.iloc[k]
            high = float(f_row["high"])
            low = float(f_row["low"])
            
            if direction == "BUY":
                if low <= sl:
                    outcome = 0
                    exit_price = sl
                    exit_time = f_row["datetime"]
                    break
                elif high >= tp:
                    outcome = 1
                    exit_price = tp
                    exit_time = f_row["datetime"]
                    break
            else: # SELL
                if high >= sl:
                    outcome = 0
                    exit_price = sl
                    exit_time = f_row["datetime"]
                    break
                elif low <= tp:
                    outcome = 1
                    exit_price = tp
                    exit_time = f_row["datetime"]
                    break
                    
        # If the trade resolves, compile it
        if outcome is not None:
            c.update({
                "outcome": outcome,
                "exit_price": exit_price,
                "exit_timestamp": exit_time.strftime("%Y-%m-%d %H:%M:%S")
            })
            labeled_candidates.append(c)
            
            # Extract feature vector matching feature names (sorted keys)
            # Find the features row corresponding to this index in df_m15_feat
            # Since df_m15_feat might have fewer rows due to shifts, we match by datetime
            dt = c["timestamp"]
            feat_row = df_m15_feat[df_m15_feat["datetime"] == dt]
            if not feat_row.empty:
                feat_dict = feat_row.iloc[0].to_dict()
                del feat_dict["datetime"]
                sorted_keys = sorted(feat_dict.keys())
                X_features.append([feat_dict[k] for k in sorted_keys])
                y_labels.append(outcome)
                
    X = np.array(X_features)
    y = np.array(y_labels)
    
    # 3. Simulate Walk-Forward predictions (Layer 2)
    # First 50% used to fit initial forest, last 50% evaluated out-of-sample
    ml_probabilities = ml_model_service.simulate_walk_forward_backtest(X, y, train_ratio=0.5)
    
    # 4. A/B Simulations
    # Run A: Rules-Only (evaluates all labeled candidates in test window, i.e., index >= 50% mark)
    # Run B: Rules + ML (evaluates only candidates in test window where ML prob >= cutoff)
    start_test_idx = int(len(labeled_candidates) * 0.5)
    
    # Trace initial states
    balance_a = settings.account_balance
    balance_b = settings.account_balance
    peak_a = balance_a
    peak_b = balance_b
    dd_a = 0.0
    dd_b = 0.0
    
    wins_a = 0
    trades_a = 0
    wins_b = 0
    trades_b = 0
    
    r_multiples_a = []
    r_multiples_b = []
    
    equity_a = [{"time": labeled_candidates[start_test_idx]["timestamp"].strftime("%Y-%m-%d %H:%M:%S"), "balance": balance_a}]
    equity_b = [{"time": labeled_candidates[start_test_idx]["timestamp"].strftime("%Y-%m-%d %H:%M:%S"), "balance": balance_b}]
    
    trades_log = []
    
    for i in range(start_test_idx, len(labeled_candidates)):
        c = labeled_candidates[i]
        prob = ml_probabilities[i]
        outcome = c["outcome"]
        lot_size = c["lot_size"]
        entry = c["entry_price"]
        exit_p = c["exit_price"]
        direction = c["direction"]
        
        diff = exit_p - entry if direction == "BUY" else entry - exit_p
        pnl = diff * lot_size * 100.0
        
        # 1. Process Run A (Rules-Only)
        trades_a += 1
        r_mult = 3.0 if outcome == 1 else -1.0
        r_multiples_a.append(r_mult)
        if outcome == 1:
            wins_a += 1
            
        balance_a += pnl
        peak_a = max(peak_a, balance_a)
        dd_a = max(dd_a, (peak_a - balance_a) / peak_a * 100.0)
        
        equity_a.append({
            "time": c["timestamp"].strftime("%Y-%m-%d %H:%M:%S"),
            "balance": round(balance_a, 2)
        })
        
        # 2. Process Run B (Rules + ML)
        is_ml_approved = prob >= cutoff
        pnl_b_log = 0.0
        
        if is_ml_approved:
            trades_b += 1
            r_multiples_b.append(r_mult)
            if outcome == 1:
                wins_b += 1
                
            balance_b += pnl
            peak_b = max(peak_b, balance_b)
            dd_b = max(dd_b, (peak_b - balance_b) / peak_b * 100.0)
            pnl_b_log = pnl
            
            equity_b.append({
                "time": c["timestamp"].strftime("%Y-%m-%d %H:%M:%S"),
                "balance": round(balance_b, 2)
            })
            
        # Log trade detail for comparison list
        trades_log.append({
            "timestamp": c["timestamp"].strftime("%Y-%m-%d %H:%M:%S"),
            "direction": direction,
            "entry_price": entry,
            "exit_price": exit_p,
            "outcome": "WIN" if outcome == 1 else "LOSS",
            "pnl": round(pnl, 2),
            "ml_prob": round(prob, 2),
            "ml_approved": is_ml_approved
        })
        
    win_rate_a = (wins_a / trades_a * 100.0) if trades_a > 0 else 0.0
    win_rate_b = (wins_b / trades_b * 100.0) if trades_b > 0 else 0.0
    
    avg_r_a = float(np.mean(r_multiples_a)) if r_multiples_a else 0.0
    avg_r_b = float(np.mean(r_multiples_b)) if r_multiples_b else 0.0
    
    return {
        "rules_only": {
            "win_rate": round(win_rate_a, 1),
            "total_trades": trades_a,
            "max_drawdown": round(dd_a, 2),
            "average_r": round(avg_r_a, 2),
            "net_r": round(sum(r_multiples_a), 1),
            "equity_curve": equity_a
        },
        "rules_ml": {
            "win_rate": round(win_rate_b, 1),
            "total_trades": trades_b,
            "max_drawdown": round(dd_b, 2),
            "average_r": round(avg_r_b, 2),
            "net_r": round(sum(r_multiples_b), 1),
            "equity_curve": equity_b
        },
        "trades": trades_log
    }
