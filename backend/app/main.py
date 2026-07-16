import asyncio
import threading
import random
from datetime import datetime, timedelta
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List

from app.config import load_settings, update_settings
from app.database import (
    init_db, get_signals, get_stats, add_signal, 
    update_signal_status, get_db_connection, 
    get_candidates_count, add_candidate_history, get_latest_model_meta
)
from app.data_feed import data_feed
from app.engine import evaluate_strategy
from app.backtester import run_backtest
from app.ws_manager import manager
from app.notifier import send_telegram_alert, test_telegram_connection
from app.ml_model import ml_model_service

app = FastAPI(title="Gold Challenge Desk API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SettingsUpdate(BaseModel):
    settings: Dict[str, Any]

class TelegramTestRequest(BaseModel):
    token: str
    chat_id: str

@app.on_event("startup")
def startup_event():
    """Run database initialization and start background data simulator."""
    init_db()
    # Start the price tick generator loop in a background thread
    threading.Thread(target=start_price_simulation_loop, daemon=True).start()

def start_price_simulation_loop():
    """Loop running in background thread to generate price ticks and execute strategy."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(price_simulation_worker())

async def price_simulation_worker():
    """Worker task generating ticks every 3 seconds, evaluating signals & active trades."""
    last_processed_candle_time = ""
    
    while True:
        try:
            # Generate a new tick
            tick = data_feed.get_live_tick()
            current_price = tick["price"]
            latest_candle = tick["candle"]
            candle_time = latest_candle["datetime"]
            
            # 1. Manage Active/Pending Trades in Database
            conn = get_db_connection()
            cursor = conn.cursor()
            
            # Select pending/active signals
            if hasattr(cursor, "execute"):
                # Handle connection wrapper variations for sqlite3/psycopg2
                # In sqlite, get_db_connection returns sqlite3.Connection.
                # In postgres, it returns psycopg2.extras.RealDictConnection
                # Both have cursor and execution mechanisms.
                # We fetch status column
                # To be resilient across SQLite and Postgres row naming syntax:
                cursor.execute("SELECT * FROM signals WHERE status IN ('PENDING', 'ACTIVE')")
                active_trades = cursor.fetchall()
            
            for trade in active_trades:
                trade_id = trade["id"]
                direction = trade["direction"]
                sl = trade["stop_loss"]
                tp = trade["take_profit"]
                status = trade["status"]
                
                if status == "PENDING":
                    update_signal_status(trade_id, "ACTIVE")
                    status = "ACTIVE"
                    
                if status == "ACTIVE":
                    hit_sl = False
                    hit_tp = False
                    
                    if direction == "BUY":
                        if current_price <= sl:
                            hit_sl = True
                        elif current_price >= tp:
                            hit_tp = True
                    else:  # SELL
                        if current_price >= sl:
                            hit_sl = True
                        elif current_price <= tp:
                            hit_tp = True
                            
                    if hit_sl or hit_tp:
                        outcome = "WIN" if hit_tp else "LOSS"
                        exit_price = tp if hit_tp else sl
                        r_multiple = 3.0 if hit_tp else -1.0
                        
                        update_signal_status(trade_id, outcome, exit_price, r_multiple)
                        
                        # Broadcast update
                        await manager.broadcast({
                            "type": "SIGNAL_UPDATE",
                            "data": {
                                "id": trade_id,
                                "status": outcome,
                                "exit_price": exit_price,
                                "exit_timestamp": datetime.utcnow().isoformat(),
                                "r_multiple": r_multiple
                            }
                        })
                        
            conn.close()
            
            # 2. Evaluate Strategy on Candle Completion
            if candle_time != last_processed_candle_time:
                last_processed_candle_time = candle_time
                
                df_m5 = data_feed.fetch_ohlcv(interval="5min", outputsize=100)
                df_m15 = data_feed.fetch_ohlcv(interval="15min", outputsize=100)
                df_h1 = data_feed.fetch_ohlcv(interval="1h", outputsize=100)
                df_h4 = data_feed.fetch_ohlcv(interval="4h", outputsize=100)
                
                signal = evaluate_strategy(df_m5, df_m15, df_h1, df_h4)
                
                if signal:
                    signal_id = add_signal(signal)
                    signal["id"] = signal_id
                    
                    send_telegram_alert(signal)
                    
                    await manager.broadcast({
                        "type": "NEW_SIGNAL",
                        "data": signal
                    })
            
            # 3. Broadcast TICK updates
            await manager.broadcast({
                "type": "TICK",
                "data": {
                    "price": current_price,
                    "timestamp": tick["timestamp"],
                    "candle": latest_candle
                }
            })
            
        except Exception as e:
            print(f"Error in price simulation worker: {e}")
            
        await asyncio.sleep(3.0)

# API Endpoints
@app.get("/api/settings")
def get_current_settings():
    return load_settings()

@app.post("/api/settings")
def save_updated_settings(payload: SettingsUpdate):
    try:
        updated = update_settings(payload.settings)
        return updated
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/signals")
def get_past_signals(limit: int = 50):
    return get_signals(limit)

@app.get("/api/candles")
def get_candles_endpoint(interval: str = "15min", limit: int = 200):
    """Retrieve historical candle logs for Symbol XAUUSD to plot in charts."""
    try:
        df = data_feed.fetch_ohlcv(interval=interval, outputsize=limit)
        candles = []
        for _, row in df.iterrows():
            candles.append({
                "time": int(row["datetime"].timestamp()),  # Unix timestamp for Lightweight Charts
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": int(row["volume"])
            })
        return candles
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stats")
def get_metrics_and_active():
    return get_stats()

@app.post("/api/test-telegram")
def run_telegram_test(payload: TelegramTestRequest):
    success = test_telegram_connection(payload.token, payload.chat_id)
    return {"success": success}

@app.post("/api/trigger-mock-signal")
async def trigger_mock_signal():
    """Trigger a mock signal tagged with ML parameters to test frontend panels."""
    curr_price = data_feed.mock_current_price
    direction = "BUY" if round(curr_price) % 2 == 0 else "SELL"
    
    sl_dist = 4.0
    tp_dist = sl_dist * 2.0  # 1:2 Risk to Reward
    sl = round(curr_price - sl_dist if direction == "BUY" else curr_price + sl_dist, 2)
    tp = round(curr_price + tp_dist if direction == "BUY" else curr_price - tp_dist, 2)
    
    utc_now = datetime.utcnow()
    hour = utc_now.hour
    session_name = "ASIAN" if (0 <= hour <= 8) else "NEW_YORK" if (13 <= hour <= 21) else "LONDON"
    
    settings = load_settings()
    risk_amount = settings.account_balance * (settings.risk_percent / 100.0)
    lot_size = max(0.01, round(risk_amount / (sl_dist * 100.0), 2))
    
    ml_ver = ml_model_service.model_version
    if ml_ver == "N/A" or ml_ver == "NO_MODEL":
        ml_ver = "v_xgb_dev_demo"
        
    signal = {
        "pair": "XAUUSD",
        "direction": direction,
        "entry_price": round(curr_price, 2),
        "stop_loss": sl,
        "take_profit": tp,
        "risk_reward": 2.0,
        "lot_size": lot_size,
        "session": session_name,
        "timestamp": utc_now.isoformat(),
        "confluence_reasons": [
            "4H Trend bias aligned Bullish",
            "1H Structure discount zone check respected",
            "15M Bullish Order Block mitigation triggered",
            "5M Bullish CHOCH entry confirmed",
            "US Session high-impact news clean window"
        ] if direction == "BUY" else [
            "4H Trend bias aligned Bearish",
            "1H Structure premium zone check respected",
            "15M Bearish Order Block mitigation triggered",
            "5M Bearish CHOCH entry confirmed",
            "US Session high-impact news clean window"
        ],
        "confidence_score": 92,
        "status": "PENDING",
        "ml_confidence_score": 0.88,
        "ml_version": ml_ver,
        "is_ml_approved": True
    }
    
    signal_id = add_signal(signal)
    signal["id"] = signal_id
    
    send_telegram_alert(signal)
    
    await manager.broadcast({
        "type": "NEW_SIGNAL",
        "data": signal
    })
    
    return {"status": "success", "signal": signal}

@app.post("/api/train-model")
def train_ml_model():
    """Trigger RF Model retraining. Seeds dataset automatically if candidates < 200."""
    count = get_candidates_count()
    
    # Auto-seed mock training candidates if table is empty, ensuring immediate demo functionality
    if count < 200:
        print(f"ML API: Seeding {210 - count} mock candidates for demo retraining...")
        now = datetime.utcnow()
        for j in range(210):
            c_time = now - timedelta(hours=(210 - j))
            
            # High-fidelity mock features
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
                "entry_price": 2350.0 + random.gauss(0, 15),
                "stop_loss": 2345.0,
                "take_profit": 2365.0,
                "timestamp": c_time.isoformat()
            }
            add_candidate_history(candidate, feats, outcome)
            
    try:
        report = ml_model_service.train_active_model()
        return {"status": "success", "report": report}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/model-health")
def get_model_health():
    """Fetch active model meta stats and drift indicators."""
    meta = get_latest_model_meta()
    
    # Calculate live closed accuracy
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM signals WHERE is_ml_approved = 1 AND status IN ('WIN', 'LOSS')")
    live_closed_total = cursor.fetchone()[0] or 0
    
    cursor.execute("SELECT COUNT(*) FROM signals WHERE is_ml_approved = 1 AND status = 'WIN'")
    live_closed_wins = cursor.fetchone()[0] or 0
    
    conn.close()
    
    live_acc = (live_closed_wins / live_closed_total) if live_closed_total > 0 else 0.0
    
    # Drift check: if live win rate drops 15% below backtest training accuracy
    drift_warning = False
    if meta and live_closed_total >= 10:
        if (meta["accuracy"] - live_acc) >= 0.15:
            drift_warning = True
            
    return {
        "active": meta is not None,
        "metadata": meta,
        "live_accuracy": round(live_acc * 100.0, 1),
        "total_live_signals": live_closed_total,
        "drift_warning": drift_warning,
        "candidates_count": get_candidates_count(),
        "min_required": 200
    }

@app.post("/api/backtest")
def run_historical_backtest():
    """Trigger historical backtest comparative analysis."""
    df_m15 = data_feed.fetch_ohlcv(interval="15min", outputsize=400)
    df_h4 = data_feed.fetch_ohlcv(interval="4h", outputsize=100)
    
    results = run_backtest(df_m15, df_h4)
    return results

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)
