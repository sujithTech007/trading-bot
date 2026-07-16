import sys
import os
import random
from datetime import datetime, timedelta

# Add backend app to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
import numpy as np
from app.database import init_db
from app.engine import (
    evaluate_strategy,
    get_pivots,
    detect_structure,
    detect_obs_and_fvgs,
    check_liquidity_sweep
)

def generate_trend_candles(num_bars: int, trend: str = "BULLISH") -> pd.DataFrame:
    """Helper to generate a trending series of candles."""
    now = datetime.utcnow()
    candles = []
    price = 2350.0
    for i in range(num_bars):
        c_time = now - timedelta(minutes=15 * (num_bars - i))
        # upward vs downward bias
        change = random.gauss(1.0 if trend == "BULLISH" else -1.0, 0.5)
        open_p = price
        close_p = open_p + change
        high_p = max(open_p, close_p) + abs(random.gauss(0.1, 0.1))
        low_p = min(open_p, close_p) - abs(random.gauss(0.1, 0.1))
        
        candles.append({
            "datetime": c_time,
            "open": open_p,
            "high": high_p,
            "low": low_p,
            "close": close_p,
            "volume": int(random.uniform(500, 1500))
        })
        price = close_p
    return pd.DataFrame(candles)

def test_smc_formulas():
    print("[TEST] Verifying SMC Indicator Calculations...")
    
    # 1. Generate fake candles
    df = generate_trend_candles(100, "BULLISH")
    
    # 2. Test Pivot High / Low
    pivots = get_pivots(df, left=2, right=2)
    assert isinstance(pivots, list)
    print(f"[PASS] Swing pivot detection returned {len(pivots)} elements.")
    
    # 3. Test Structure Analysis
    struct = detect_structure(df, pivots)
    assert "structure" in struct
    assert "midpoint" in struct
    assert "zone" in struct
    print(f"[PASS] Structure is {struct['structure']}, Zone is {struct['zone']}.")
    
    # 4. Test OBs and FVGs
    zones = detect_obs_and_fvgs(df)
    assert "bullish_obs" in zones
    assert "bearish_obs" in zones
    assert "bullish_fvgs" in zones
    assert "bearish_fvgs" in zones
    print(f"[PASS] Detected {len(zones['bullish_obs'])} Bullish OBs, {len(zones['bullish_fvgs'])} Bullish FVGs.")

    # 5. Test Liquidity sweeps
    sweep_sell, sweep_buy = check_liquidity_sweep(df, pivots)
    assert isinstance(sweep_sell, bool)
    assert isinstance(sweep_buy, bool)
    print(f"[PASS] Liquidity check - Swept Sell: {sweep_sell}, Swept Buy: {sweep_buy}")
    
    # 6. Test Multi-Timeframe Strategy execution
    print("Testing multi-timeframe strategy engine call...")
    init_db()  # Ensures candidate table is created
    
    df_m5 = generate_trend_candles(100, "BULLISH")
    df_m15 = generate_trend_candles(100, "BULLISH")
    df_h1 = generate_trend_candles(100, "BULLISH")
    df_h4 = generate_trend_candles(100, "BULLISH")
    
    # Evaluate setup
    setup = evaluate_strategy(df_m5, df_m15, df_h1, df_h4)
    print(f"Strategy returned setup: {setup}")
    print("[SUCCESS] All SMC Engine tests passed successfully!")

if __name__ == "__main__":
    test_smc_formulas()
