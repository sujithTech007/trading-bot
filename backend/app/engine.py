import pandas as pd
import numpy as np
from datetime import datetime, time as dt_time
from typing import Dict, Any, List, Tuple, Optional
from app.config import Settings, load_settings
from app.database import get_daily_pnl, add_candidate_history
from app.feature_pipeline import extract_latest_features
from app.ml_model import ml_model_service

def calculate_ema(series: pd.Series, period: int) -> pd.Series:
    """Calculate Exponential Moving Average."""
    return series.ewm(span=period, adjust=False).mean()

def calculate_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Calculate Relative Strength Index (RSI)."""
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).copy()
    loss = (-delta.where(delta < 0, 0)).copy()
    avg_gain = gain.ewm(com=period - 1, adjust=False).mean()
    avg_loss = loss.ewm(com=period - 1, adjust=False).mean()
    rs = avg_gain / (avg_loss + 1e-10)
    return 100 - (100 / (1 + rs))

def calculate_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Calculate Average True Range (ATR)."""
    high = df["high"]
    low = df["low"]
    close_prev = df["close"].shift(1)
    tr1 = high - low
    tr2 = (high - close_prev).abs()
    tr3 = (low - close_prev).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.ewm(span=period, adjust=False).mean()

def is_in_session(current_time_utc: datetime, settings: Settings) -> Tuple[bool, str]:
    """Verify UTC session hours boundaries (New York and Asian sessions prioritize)."""
    current_time = current_time_utc.time()
    
    def parse_time(time_str: str) -> dt_time:
        parts = time_str.split(":")
        return dt_time(int(parts[0]), int(parts[1]))
    
    asian_start = parse_time(settings.asian_start)
    asian_end = parse_time(settings.asian_end)
    ny_start = parse_time(settings.ny_start)
    ny_end = parse_time(settings.ny_end)
    
    in_asian = False
    if asian_start <= asian_end:
        in_asian = asian_start <= current_time <= asian_end
    else:
        in_asian = current_time >= asian_start or current_time <= asian_end
        
    in_ny = False
    if ny_start <= ny_end:
        in_ny = ny_start <= current_time <= ny_end
    else:
        in_ny = current_time >= ny_start or current_time <= ny_end
        
    in_london = False
    london_start = dt_time(8, 0)
    london_end = dt_time(13, 0)
    in_london = london_start <= current_time <= london_end
    
    if in_asian:
        return True, "ASIAN"
    elif in_ny:
        return True, "NEW_YORK"
    elif in_london:
        return True, "LONDON"
        
    return False, "OUT_OF_SESSION"

def check_circuit_breakers(settings: Settings) -> Tuple[bool, str]:
    """Safety locks against daily/weekly drawdown limits."""
    daily_pnl = get_daily_pnl(today_only=True)
    max_daily_loss = settings.account_balance * (settings.max_daily_loss_percent / 100.0)
    if daily_pnl < 0 and abs(daily_pnl) >= max_daily_loss:
        return True, f"Daily max loss hit: ${abs(daily_pnl):,.2f} lost"
        
    total_pnl = get_daily_pnl(today_only=False)
    max_weekly_loss = settings.account_balance * (settings.max_weekly_loss_percent / 100.0)
    if total_pnl < 0 and abs(total_pnl) >= max_weekly_loss:
        return True, f"Max drawdown hit: ${abs(total_pnl):,.2f} loss"
        
    return False, "ACTIVE"

def is_news_blackout(current_time_utc: datetime) -> bool:
    """Blocks trading around high-impact economic news releases (+/- 30 mins)."""
    weekday = current_time_utc.weekday()
    day = current_time_utc.day
    
    # NFP: First Friday of month 13:30 UTC
    if weekday == 4 and 1 <= day <= 7:
        nfp_time = datetime(current_time_utc.year, current_time_utc.month, day, 13, 30)
        if abs((current_time_utc - nfp_time).total_seconds()) / 60.0 <= 30:
            return True
            
    # CPI: 10th-16th Wednesday 12:30 UTC
    if weekday == 2 and 10 <= day <= 16:
        cpi_time = datetime(current_time_utc.year, current_time_utc.month, day, 12, 30)
        if abs((current_time_utc - cpi_time).total_seconds()) / 60.0 <= 30:
            return True
            
    # FOMC: 15th-22nd Wednesday 18:00 UTC
    if weekday == 2 and 15 <= day <= 22:
        fomc_time = datetime(current_time_utc.year, current_time_utc.month, day, 18, 0)
        if abs((current_time_utc - fomc_time).total_seconds()) / 60.0 <= 30:
            return True
            
    return False

def get_pivots(df: pd.DataFrame, left: int = 3, right: int = 3) -> List[Dict[str, Any]]:
    """Detect local pivot highs and lows (swing pivots)."""
    highs = df["high"].values
    lows = df["low"].values
    dates = df["datetime"].values
    pivots = []
    
    for i in range(left, len(df) - right):
        is_high = True
        is_low = True
        for j in range(1, left + 1):
            if highs[i] < highs[i - j]: is_high = False
            if lows[i] > lows[i - j]: is_low = False
        for j in range(1, right + 1):
            if highs[i] <= highs[i + j]: is_high = False
            if lows[i] >= lows[i + j]: is_low = False
            
        if is_high:
            pivots.append({"type": "HIGH", "index": i, "price": float(highs[i]), "time": dates[i]})
        if is_low:
            pivots.append({"type": "LOW", "index": i, "price": float(lows[i]), "time": dates[i]})
            
    return pivots

def detect_structure(df: pd.DataFrame, pivots: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Detect HH/HL or LH/LL trend structure and Premium/Discount zones."""
    closes = df["close"].values
    latest_close = float(closes[-1])
    
    highs = [p["price"] for p in pivots if p["type"] == "HIGH"]
    lows = [p["price"] for p in pivots if p["type"] == "LOW"]
    
    structure = "NEUTRAL"
    if len(highs) >= 2 and len(lows) >= 2:
        if highs[-1] > highs[-2] and lows[-1] > lows[-2]:
            structure = "BULLISH"
        elif highs[-1] < highs[-2] and lows[-1] < lows[-2]:
            structure = "BEARISH"
            
    # Midpoint of the current range for Premium/Discount calculations
    min_low = float(df["low"].iloc[-40:].min())
    max_high = float(df["high"].iloc[-40:].max())
    midpoint = (min_low + max_high) / 2.0
    zone = "DISCOUNT" if latest_close < midpoint else "PREMIUM"
    
    return {
        "structure": structure,
        "midpoint": midpoint,
        "zone": zone,
        "min_low": min_low,
        "max_high": max_high
    }

def detect_obs_and_fvgs(df: pd.DataFrame) -> Dict[str, Any]:
    """Detect order blocks and fair value gaps."""
    closes = df["close"].values
    highs = df["high"].values
    lows = df["low"].values
    opens = df["open"].values
    
    bullish_fvgs = []
    bearish_fvgs = []
    
    # 1. Fair Value Gaps
    for i in range(2, len(df)):
        if highs[i - 2] < lows[i] and closes[i - 1] > opens[i - 1]:
            # Bullish FVG
            sub_low = lows[i:].min() if i < len(df) - 1 else float("inf")
            if sub_low > highs[i - 2]:  # Unfilled
                bullish_fvgs.append({"top": float(lows[i]), "bottom": float(highs[i - 2]), "index": i - 1})
        elif lows[i - 2] > highs[i] and closes[i - 1] < opens[i - 1]:
            # Bearish FVG
            sub_high = highs[i:].max() if i < len(df) - 1 else float("-inf")
            if sub_high < lows[i - 2]:  # Unfilled
                bearish_fvgs.append({"top": float(lows[i - 2]), "bottom": float(highs[i]), "index": i - 1})
                
    # 2. Order Blocks
    bullish_obs = []
    bearish_obs = []
    for i in range(4, len(df) - 3):
        if closes[i] < opens[i]:  # Bearish candle
            # Followed by strong upward move
            if closes[i + 1] > opens[i + 1] and closes[i + 2] > opens[i + 2] and closes[i + 3] > highs[i]:
                sub_low = lows[i + 1:].min()
                if sub_low > lows[i]:  # Unmitigated
                    bullish_obs.append({"top": float(highs[i]), "bottom": float(lows[i]), "index": i})
        elif closes[i] > opens[i]:  # Bullish candle
            if closes[i + 1] < opens[i + 1] and closes[i + 2] < opens[i + 2] and closes[i + 3] < lows[i]:
                sub_high = highs[i + 1:].max()
                if sub_high < highs[i]:  # Unmitigated
                    bearish_obs.append({"top": float(highs[i]), "bottom": float(lows[i]), "index": i})
                    
    return {
        "bullish_obs": bullish_obs,
        "bearish_obs": bearish_obs,
        "bullish_fvgs": bullish_fvgs,
        "bearish_fvgs": bearish_fvgs
    }

def check_liquidity_sweep(df: pd.DataFrame, pivots: List[Dict[str, Any]]) -> Tuple[bool, bool]:
    """Check if liquidity has been swept."""
    highs = df["high"].values
    lows = df["low"].values
    closes = df["close"].values
    
    recent_highs = [p["price"] for p in pivots if p["type"] == "HIGH"][-3:]
    recent_lows = [p["price"] for p in pivots if p["type"] == "LOW"][-3:]
    
    swept_sell_side = False
    swept_buy_side = False
    
    if recent_lows:
        last_low = recent_lows[-1]
        if lows[-1] < last_low and closes[-1] > last_low:
            swept_sell_side = True
            
    if recent_highs:
        last_high = recent_highs[-1]
        if highs[-1] > last_high and closes[-1] < last_high:
            swept_buy_side = True
            
    return swept_sell_side, swept_buy_side

def evaluate_strategy(df_m5: pd.DataFrame, df_m15: pd.DataFrame, df_h1: pd.DataFrame, df_h4: pd.DataFrame, current_time_utc: Optional[datetime] = None) -> Optional[Dict[str, Any]]:
    """
    Evaluate multi-timeframe SMC strategy logic.
    - 4H overall trend
    - 1H structure premium/discount zone
    - 15M trade zones (FVG/OB)
    - 5M entries (BOS/CHOCH, sweeps, volume)
    """
    settings = load_settings()
    
    is_disabled, cb_reason = check_circuit_breakers(settings)
    if is_disabled:
        return None
        
    eval_time = current_time_utc or datetime.utcnow()
    
    # 1. Session Gate
    is_active_session, session_name = is_in_session(eval_time, settings)
    if not is_active_session:
        return None
        
    # 2. News Blackout Gate
    if is_news_blackout(eval_time):
        return None
        
    # 3. 4H Trend Determination (EMA 200 filter)
    h4_closes = df_h4["close"]
    h4_ema = calculate_ema(h4_closes, 200)
    latest_h4_close = h4_closes.iloc[-1]
    h4_pivots = get_pivots(df_h4)
    h4_struct = detect_structure(df_h4, h4_pivots)
    
    trend_4h = "NEUTRAL"
    if latest_h4_close > h4_ema.iloc[-1] and h4_struct["structure"] == "BULLISH":
        trend_4h = "BULLISH"
    elif latest_h4_close < h4_ema.iloc[-1] and h4_struct["structure"] == "BEARISH":
        trend_4h = "BEARISH"
        
    if trend_4h == "NEUTRAL":
        return None  # Trend must align
        
    # 4. 1H Market Structure & Zone confirm
    h1_pivots = get_pivots(df_h1)
    h1_struct = detect_structure(df_h1, h1_pivots)
    
    if trend_4h == "BULLISH" and h1_struct["zone"] != "DISCOUNT":
        return None  # Buy only in Discount
    if trend_4h == "BEARISH" and h1_struct["zone"] != "PREMIUM":
        return None  # Sell only in Premium
        
    # 5. 15M Trade Zones (FVG, OB mitigation)
    m15_zones = detect_obs_and_fvgs(df_m15)
    latest_m15_close = df_m15["close"].iloc[-1]
    
    touching_bullish_ob = any(ob["bottom"] <= latest_m15_close <= ob["top"] for ob in m15_zones["bullish_obs"])
    touching_bearish_ob = any(ob["bottom"] <= latest_m15_close <= ob["top"] for ob in m15_zones["bearish_obs"])
    touching_bullish_fvg = any(fvg["bottom"] <= latest_m15_close <= fvg["top"] for fvg in m15_zones["bullish_fvgs"])
    touching_bearish_fvg = any(fvg["bottom"] <= latest_m15_close <= fvg["top"] for fvg in m15_zones["bearish_fvgs"])
    
    # 6. 5M Entry timeframe execution (BOS/CHOCH, sweeps, volume)
    m5_pivots = get_pivots(df_m5)
    swept_sell_side, swept_buy_side = check_liquidity_sweep(df_m5, m5_pivots)
    
    latest_m5_close = df_m5["close"].iloc[-1]
    latest_m5_open = df_m5["open"].iloc[-1]
    m5_vol = df_m5["volume"].iloc[-1]
    m5_vol_sma = df_m5["volume"].iloc[-20:].mean()
    
    buy_trigger = False
    sell_trigger = False
    confluence_reasons = []
    rules_score = 0
    
    if trend_4h == "BULLISH":
        # 5M BOS / CHOCH: close above the last 5M pivot high
        recent_m5_highs = [p["price"] for p in m5_pivots if p["type"] == "HIGH"]
        if recent_m5_highs and latest_m5_close > recent_m5_highs[-1] and latest_m5_close > latest_m5_open:
            if swept_sell_side and (touching_bullish_ob or touching_bullish_fvg):
                buy_trigger = True
                
                # Confluence points calculations
                rules_score += 15  # Trend alignment (15 pts)
                confluence_reasons.append("4H Trend bias aligned Bullish")
                
                rules_score += 15  # Market structure (15 pts)
                confluence_reasons.append("1H Structure discount zone check respected")
                
                rules_score += 15  # Liquidity sweep (15 pts)
                confluence_reasons.append("Sell-side liquidity swept on 5M timeframe")
                
                if touching_bullish_ob:
                    rules_score += 10  # Order block quality (10 pts)
                    confluence_reasons.append("Bullish Order Block mitigation triggered")
                if touching_bullish_fvg:
                    rules_score += 10  # FVG respected (10 pts)
                    confluence_reasons.append("Bullish Fair Value Gap entry confirmed")
                    
                if m5_vol > 1.2 * m5_vol_sma:
                    rules_score += 10  # Volume confirmation (10 pts)
                    confluence_reasons.append("Volume expansion breakout confirmed")
                    
                if session_name in ["NEW_YORK", "LONDON"]:
                    rules_score += 10  # Session quality (10 pts)
                    confluence_reasons.append(f"Session filter active ({session_name})")
                    
    elif trend_4h == "BEARISH":
        recent_m5_lows = [p["price"] for p in m5_pivots if p["type"] == "LOW"]
        if recent_m5_lows and latest_m5_close < recent_m5_lows[-1] and latest_m5_close < latest_m5_open:
            if swept_buy_side and (touching_bearish_ob or touching_bearish_fvg):
                sell_trigger = True
                
                rules_score += 15
                confluence_reasons.append("4H Trend bias aligned Bearish")
                
                rules_score += 15
                confluence_reasons.append("1H Structure premium zone check respected")
                
                rules_score += 15
                confluence_reasons.append("Buy-side liquidity swept on 5M timeframe")
                
                if touching_bearish_ob:
                    rules_score += 10
                    confluence_reasons.append("Bearish Order Block mitigation triggered")
                if touching_bearish_fvg:
                    rules_score += 10
                    confluence_reasons.append("Bearish Fair Value Gap entry confirmed")
                    
                if m5_vol > 1.2 * m5_vol_sma:
                    rules_score += 10
                    confluence_reasons.append("Volume expansion breakout confirmed")
                    
                if session_name in ["NEW_YORK", "LONDON"]:
                    rules_score += 10
                    confluence_reasons.append(f"Session filter active ({session_name})")
                    
    if not buy_trigger and not sell_trigger:
        return None
        
    # ATR dynamic stops sizing
    m5_atr = calculate_atr(df_m5, 14).iloc[-1]
    entry_price = round(latest_m5_close, 2)
    direction = "BUY" if buy_trigger else "SELL"
    
    if direction == "BUY":
        stop_loss = round(entry_price - (m5_atr * 2.0), 2)
        take_profit = round(entry_price + (m5_atr * 4.0), 2)  # 1:2 Risk to Reward
    else:
        stop_loss = round(entry_price + (m5_atr * 2.0), 2)
        take_profit = round(entry_price - (m5_atr * 4.0), 2)
        
    risk_reward = 2.0
    rules_score += 15  # Risk-to-reward: 15 pts (since 1:2 R:R is guaranteed)
    
    # 7. LAYER 2: XGBOOST CONFIDENCE MODEL
    features = extract_latest_features(df_m5)
    ml_prob, ml_ver = ml_model_service.predict_probability(features)
    
    # Final confidence score combines Rules (weighted 50%) and ML (weighted 50%)
    ml_pct = ml_prob * 100
    confidence_score = int(0.5 * rules_score + 0.5 * ml_pct)
    
    candidate = {
        "pair": "XAUUSD",
        "direction": direction,
        "entry_price": entry_price,
        "stop_loss": stop_loss,
        "take_profit": take_profit,
        "risk_reward": risk_reward,
        "lot_size": 0.1,  # Will be adjusted by frontend risk settings
        "session": session_name,
        "timestamp": eval_time.isoformat(),
        "confluence_reasons": confluence_reasons,
        "confidence_score": confidence_score,
        "status": "PENDING",
        "ml_confidence_score": round(ml_prob, 2),
        "ml_version": ml_ver,
        "is_ml_approved": bool(ml_prob >= getattr(settings, "ml_confidence_cutoff", 0.65))
    }
    
    # Log candidate to database for data accumulation
    add_candidate_history(candidate, features)
    
    # Strict 85% Confidence cut-off gate
    if confidence_score >= 85:
        return candidate
        
    return None
