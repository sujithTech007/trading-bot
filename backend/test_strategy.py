import sys
import os
from datetime import datetime

# Add app to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
import numpy as np
from app.config import Settings
from app.engine import calculate_ema, calculate_rsi, calculate_atr, is_in_session

def run_tests():
    print("[TEST] Starting Automated Strategy Verification Tests...")
    
    # 1. Test Moving Average Calculations
    print("Testing EMA calculation...")
    prices = pd.Series([100.0, 101.0, 102.0, 103.0, 104.0, 105.0])
    ema = calculate_ema(prices, 3)
    assert len(ema) == 6
    assert ema.iloc[-1] > ema.iloc[0]
    print("[PASS] EMA calculations validated.")

    # 2. Test RSI Calculations
    print("Testing RSI calculation...")
    prices_rsi = pd.Series([
        100.0, 101.0, 102.0, 103.0, 102.0, 101.0, 100.0, 
        99.0, 98.0, 99.0, 100.0, 101.0, 102.0, 103.0, 104.0
    ])
    rsi = calculate_rsi(prices_rsi, 5)
    assert len(rsi) == 15
    assert 0 <= rsi.iloc[-1] <= 100
    print("[PASS] RSI calculations validated.")

    # 3. Test ATR Calculations
    print("Testing ATR calculation...")
    df = pd.DataFrame({
        "high": [102.0, 103.0, 104.5, 105.0, 106.0],
        "low": [100.0, 101.0, 102.0, 103.0, 104.0],
        "close": [101.5, 102.5, 104.0, 104.5, 105.5]
    })
    atr = calculate_atr(df, 3)
    assert len(atr) == 5
    assert atr.iloc[-1] > 0
    print("[PASS] ATR calculations validated.")

    # 4. Test Session Filters
    print("Testing session filtering hours...")
    settings = Settings(
        asian_start="00:00",
        asian_end="08:00",
        ny_start="13:00",
        ny_end="21:00",
        allow_london=False,
        allow_rollover=False
    )
    
    # Asian Session (04:00 UTC)
    t_asian = datetime(2026, 7, 16, 4, 0, 0)
    in_sess, name = is_in_session(t_asian, settings)
    assert in_sess == True
    assert name == "ASIAN"
    
    # London suppressed session (10:00 UTC)
    t_london = datetime(2026, 7, 16, 10, 0, 0)
    in_sess, name = is_in_session(t_london, settings)
    assert in_sess == False
    assert "LONDON" in name
    
    # NY Session (15:00 UTC)
    t_ny = datetime(2026, 7, 16, 15, 0, 0)
    in_sess, name = is_in_session(t_ny, settings)
    assert in_sess == True
    assert name == "NEW_YORK"
    
    # Rollover suppressed session (22:00 UTC)
    t_rollover = datetime(2026, 7, 16, 22, 0, 0)
    in_sess, name = is_in_session(t_rollover, settings)
    assert in_sess == False
    assert "ROLLOVER" in name
    
    print("[PASS] Session filters validated.")
    print("[SUCCESS] All Automated Backend Tests Passed Successfully!")

if __name__ == "__main__":
    run_tests()
