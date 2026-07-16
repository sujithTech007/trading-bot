import os
import sqlite3
import json
from datetime import datetime, date
from typing import List, Dict, Any, Optional

# Check for Postgres credentials in environment
PG_HOST = os.environ.get("PGHOST")
PG_PORT = os.environ.get("PGPORT", "5432")
PG_USER = os.environ.get("PGUSER")
PG_PASSWORD = os.environ.get("PGPASSWORD")
PG_DATABASE = os.environ.get("PGDATABASE")

# Determine DB Engine
DB_ENGINE = "sqlite"
if PG_HOST and PG_USER and PG_PASSWORD and PG_DATABASE:
    try:
        import psycopg2
        # Try to connect to verify PostgreSQL connectivity
        conn = psycopg2.connect(
            host=PG_HOST,
            port=PG_PORT,
            user=PG_USER,
            password=PG_PASSWORD,
            dbname=PG_DATABASE,
            connect_timeout=3
        )
        conn.close()
        DB_ENGINE = "postgres"
        print(f"Database Router: Connected to PostgreSQL on {PG_HOST}:{PG_PORT}")
    except Exception as e:
        print(f"Database Router: Failed to connect to PostgreSQL: {e}. Falling back to SQLite.")
else:
    print("Database Router: PostgreSQL config missing in env. Defaulting to local SQLite.")

DB_DIR = os.path.dirname(os.path.abspath(__file__))
SQLITE_FILE_PATH = os.path.join(DB_DIR, "..", "signals.db")

def get_db_connection():
    """Establish a connection to either Postgres or SQLite depending on active engine."""
    if DB_ENGINE == "postgres":
        import psycopg2
        from psycopg2.extras import RealDictConnection
        return psycopg2.connect(
            host=PG_HOST,
            port=PG_PORT,
            user=PG_USER,
            password=PG_PASSWORD,
            dbname=PG_DATABASE,
            connection_factory=RealDictConnection
        )
    else:
        conn = sqlite3.connect(SQLITE_FILE_PATH)
        conn.row_factory = sqlite3.Row
        return conn

def format_sql(sql: str) -> str:
    """Helper to convert standard SQLite parameter formatting (?) to PostgreSQL (%s) and handle schema translations."""
    if DB_ENGINE == "postgres":
        # Translate placeholder ? -> %s
        sql = sql.replace("?", "%s")
        # Translate schema translations
        sql = sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
        sql = sql.replace("CREATE TABLE IF NOT EXISTS daily_pnl (\n        date TEXT PRIMARY KEY,", "CREATE TABLE IF NOT EXISTS daily_pnl (\n        date VARCHAR(20) PRIMARY KEY,")
    return sql

def init_db():
    """Initialize the database schema for both SQL engines."""
    if DB_ENGINE == "sqlite":
        os.makedirs(os.path.dirname(SQLITE_FILE_PATH), exist_ok=True)
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Signals Table
    signals_sql = format_sql("""
    CREATE TABLE IF NOT EXISTS signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pair TEXT NOT NULL,
        direction TEXT NOT NULL,
        entry_price REAL NOT NULL,
        stop_loss REAL NOT NULL,
        take_profit REAL NOT NULL,
        risk_reward REAL NOT NULL,
        lot_size REAL NOT NULL,
        session TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        confluence_reasons TEXT NOT NULL,
        confidence_score REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        exit_price REAL,
        exit_timestamp TEXT,
        r_multiple REAL,
        ml_confidence_score REAL,
        ml_version TEXT,
        is_ml_approved INTEGER DEFAULT 0
    )
    """)
    cursor.execute(signals_sql)
    
    # 2. Daily PnL Table
    pnl_sql = format_sql("""
    CREATE TABLE IF NOT EXISTS daily_pnl (
        date TEXT PRIMARY KEY,
        closed_pnl REAL NOT NULL DEFAULT 0.0,
        ending_balance REAL NOT NULL
    )
    """)
    cursor.execute(pnl_sql)
    
    # 3. Candidate Setup History Table (for ML retraining datasets)
    candidates_sql = format_sql("""
    CREATE TABLE IF NOT EXISTS candidates_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pair TEXT NOT NULL,
        direction TEXT NOT NULL,
        entry_price REAL NOT NULL,
        stop_loss REAL NOT NULL,
        take_profit REAL NOT NULL,
        timestamp TEXT NOT NULL,
        features_json TEXT NOT NULL, -- Engineered features stored as JSON
        outcome INTEGER -- 1 = WIN, 0 = LOSS, NULL = Pending
    )
    """)
    cursor.execute(candidates_sql)
    
    # 4. Models Registry Table
    registry_sql = format_sql("""
    CREATE TABLE IF NOT EXISTS models_registry (
        version TEXT PRIMARY KEY,
        trained_at TEXT NOT NULL,
        data_start TEXT NOT NULL,
        data_end TEXT NOT NULL,
        accuracy REAL NOT NULL,
        precision REAL NOT NULL,
        recall REAL NOT NULL,
        feature_importances TEXT NOT NULL -- JSON string of feature scores
    )
    """)
    cursor.execute(registry_sql)
    
    conn.commit()
    conn.close()

def add_signal(signal: Dict[str, Any]) -> int:
    """Insert a new signal into the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    confluence_json = json.dumps(signal.get("confluence_reasons", []))
    sql = format_sql("""
    INSERT INTO signals (
        pair, direction, entry_price, stop_loss, take_profit, risk_reward, lot_size,
        session, timestamp, confluence_reasons, confidence_score, status,
        ml_confidence_score, ml_version, is_ml_approved
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """)
    
    params = (
        signal.get("pair", "XAUUSD"),
        signal.get("direction"),
        signal.get("entry_price"),
        signal.get("stop_loss"),
        signal.get("take_profit"),
        signal.get("risk_reward", 3.0),
        signal.get("lot_size", 0.0),
        signal.get("session"),
        signal.get("timestamp", datetime.utcnow().isoformat()),
        confluence_json,
        signal.get("confidence_score", 0.0),
        signal.get("status", "PENDING"),
        signal.get("ml_confidence_score"),
        signal.get("ml_version"),
        1 if signal.get("is_ml_approved", False) else 0
    )
    
    cursor.execute(sql, params)
    
    if DB_ENGINE == "postgres":
        # In postgres, cursor.lastrowid is not supported, we use RETURNING
        cursor.execute("SELECT id FROM signals ORDER BY id DESC LIMIT 1")
        signal_id = cursor.fetchone()["id"]
    else:
        signal_id = cursor.lastrowid
        
    conn.commit()
    conn.close()
    return signal_id

def add_candidate_history(candidate: Dict[str, Any], features: Dict[str, Any], outcome: Optional[int] = None) -> int:
    """Log a generated Layer 1 Candidate trade setup for ML model ingestion."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    sql = format_sql("""
    INSERT INTO candidates_history (
        pair, direction, entry_price, stop_loss, take_profit, timestamp, features_json, outcome
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """)
    
    params = (
        candidate["pair"],
        candidate["direction"],
        candidate["entry_price"],
        candidate["stop_loss"],
        candidate["take_profit"],
        candidate.get("timestamp", datetime.utcnow().isoformat()),
        json.dumps(features),
        outcome
    )
    cursor.execute(sql, params)
    
    if DB_ENGINE == "postgres":
        cursor.execute("SELECT id FROM candidates_history ORDER BY id DESC LIMIT 1")
        candidate_id = cursor.fetchone()["id"]
    else:
        candidate_id = cursor.lastrowid
        
    conn.commit()
    conn.close()
    return candidate_id

def update_signal_status(signal_id: int, status: str, exit_price: Optional[float] = None, r_multiple: Optional[float] = None) -> None:
    """Update the status and exit details of a signal."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    exit_timestamp = datetime.utcnow().isoformat() if status in ("WIN", "LOSS", "CANCELLED") else None
    
    sql = format_sql("""
    UPDATE signals
    SET status = ?, exit_price = ?, exit_timestamp = ?, r_multiple = ?
    WHERE id = ?
    """)
    cursor.execute(sql, (status, exit_price, exit_timestamp, r_multiple, signal_id))
    
    # Check if the trade closed, record the PnL update
    if status in ("WIN", "LOSS"):
        select_sql = format_sql("SELECT lot_size, entry_price, direction, exit_price, timestamp FROM signals WHERE id = ?")
        cursor.execute(select_sql, (signal_id,))
        row = cursor.fetchone()
        if row:
            lot_size = row["lot_size"]
            entry = row["entry_price"]
            direction = row["direction"]
            exit_p = exit_price or row["exit_price"]
            
            # Update candidates history outcome label for model retraining data
            cand_outcome = 1 if status == "WIN" else 0
            update_cand_sql = format_sql("UPDATE candidates_history SET outcome = ? WHERE timestamp = ? AND direction = ?")
            cursor.execute(update_cand_sql, (cand_outcome, row["timestamp"], direction))
            
            pnl = 0.0
            if exit_p and lot_size:
                diff = exit_p - entry if direction == "BUY" else entry - exit_p
                pnl = diff * lot_size * 100.0
            
            today_str = date.today().isoformat()
            pnl_sql = format_sql("SELECT closed_pnl FROM daily_pnl WHERE date = ?")
            cursor.execute(pnl_sql, (today_str,))
            pnl_row = cursor.fetchone()
            
            if pnl_row:
                new_pnl = pnl_row["closed_pnl"] + pnl
                update_pnl_sql = format_sql("UPDATE daily_pnl SET closed_pnl = ? WHERE date = ?")
                cursor.execute(update_pnl_sql, (new_pnl, today_str))
            else:
                prev_sql = format_sql("SELECT ending_balance FROM daily_pnl ORDER BY date DESC LIMIT 1")
                cursor.execute(prev_sql)
                prev_row = cursor.fetchone()
                prev_balance = prev_row["ending_balance"] if prev_row else 100000.0
                
                insert_pnl_sql = format_sql("""
                INSERT INTO daily_pnl (date, closed_pnl, ending_balance)
                VALUES (?, ?, ?)
                """)
                cursor.execute(insert_pnl_sql, (today_str, pnl, prev_balance + pnl))
                
    conn.commit()
    conn.close()

def get_signals(limit: int = 100) -> List[Dict[str, Any]]:
    """Retrieve signals from the database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    sql = format_sql("SELECT * FROM signals ORDER BY id DESC LIMIT ?")
    cursor.execute(sql, (limit,))
    rows = cursor.fetchall()
    
    signals = []
    for r in rows:
        signals.append({
            "id": r["id"],
            "pair": r["pair"],
            "direction": r["direction"],
            "entry_price": r["entry_price"],
            "stop_loss": r["stop_loss"],
            "take_profit": r["take_profit"],
            "risk_reward": r["risk_reward"],
            "lot_size": r["lot_size"],
            "session": r["session"],
            "timestamp": r["timestamp"],
            "confluence_reasons": json.loads(r["confluence_reasons"]),
            "confidence_score": r["confidence_score"],
            "status": r["status"],
            "exit_price": r["exit_price"],
            "exit_timestamp": r["exit_timestamp"],
            "r_multiple": r["r_multiple"],
            "ml_confidence_score": r["ml_confidence_score"],
            "ml_version": r["ml_version"],
            "is_ml_approved": bool(r["is_ml_approved"])
        })
    conn.close()
    return signals

def get_daily_pnl(today_only: bool = True) -> float:
    """Calculate PnL closed today."""
    conn = get_db_connection()
    cursor = conn.cursor()
    today_str = date.today().isoformat()
    if today_only:
        sql = format_sql("SELECT closed_pnl FROM daily_pnl WHERE date = ?")
        cursor.execute(sql, (today_str,))
        row = cursor.fetchone()
        conn.close()
        return row["closed_pnl"] if row else 0.0
    else:
        sql = format_sql("SELECT SUM(closed_pnl) FROM daily_pnl")
        cursor.execute(sql)
        row = cursor.fetchone()
        conn.close()
        return row[0] if row and row[0] is not None else 0.0

def get_stats() -> Dict[str, Any]:
    """Calculate and return dashboard statistics, including model accuracy drift metrics."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Base stats
    cursor.execute(format_sql("SELECT COUNT(*) FROM signals WHERE status IN ('WIN', 'LOSS')"))
    total_closed = cursor.fetchone()[0] or 0
    
    cursor.execute(format_sql("SELECT COUNT(*) FROM signals WHERE status = 'WIN'"))
    wins = cursor.fetchone()[0] or 0
    
    cursor.execute(format_sql("SELECT AVG(r_multiple) FROM signals WHERE status = 'WIN'"))
    avg_win_r = cursor.fetchone()[0] or 0.0
    
    cursor.execute(format_sql("SELECT AVG(r_multiple) FROM signals WHERE status = 'LOSS'"))
    avg_loss_r = cursor.fetchone()[0] or 0.0
    
    cursor.execute(format_sql("SELECT SUM(r_multiple) FROM signals WHERE status IN ('WIN', 'LOSS')"))
    net_r = cursor.fetchone()[0] or 0.0
    
    # Calculate rolling win rate
    win_rate = (wins / total_closed * 100.0) if total_closed > 0 else 0.0
    
    # Fetch active signal
    cursor.execute(format_sql("SELECT * FROM signals WHERE status IN ('PENDING', 'ACTIVE') ORDER BY id DESC LIMIT 1"))
    active_row = cursor.fetchone()
    active_signal = None
    if active_row:
        active_signal = {
            "id": active_row["id"],
            "pair": active_row["pair"],
            "direction": active_row["direction"],
            "entry_price": active_row["entry_price"],
            "stop_loss": active_row["stop_loss"],
            "take_profit": active_row["take_profit"],
            "risk_reward": active_row["risk_reward"],
            "lot_size": active_row["lot_size"],
            "session": active_row["session"],
            "timestamp": active_row["timestamp"],
            "confluence_reasons": json.loads(active_row["confluence_reasons"]),
            "confidence_score": active_row["confidence_score"],
            "status": active_row["status"],
            "ml_confidence_score": active_row["ml_confidence_score"],
            "ml_version": active_row["ml_version"],
            "is_ml_approved": bool(active_row["is_ml_approved"])
        }
        
    conn.close()
    
    return {
        "total_trades": total_closed,
        "win_rate": win_rate,
        "avg_win_r": avg_win_r,
        "avg_loss_r": avg_loss_r,
        "net_r": net_r,
        "wins": wins,
        "losses": total_closed - wins,
        "active_signal": active_signal
    }

def get_candidates_count() -> int:
    """Get the total number of candidate setups in the history table."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(format_sql("SELECT COUNT(*) FROM candidates_history WHERE outcome IS NOT NULL"))
    count = cursor.fetchone()[0] or 0
    conn.close()
    return count

def get_candidates_data() -> List[Dict[str, Any]]:
    """Retrieve all candidates history for ML retraining."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(format_sql("SELECT * FROM candidates_history WHERE outcome IS NOT NULL ORDER BY id ASC"))
    rows = cursor.fetchall()
    
    candidates = []
    for r in rows:
        candidates.append({
            "id": r["id"],
            "pair": r["pair"],
            "direction": r["direction"],
            "entry_price": r["entry_price"],
            "stop_loss": r["stop_loss"],
            "take_profit": r["take_profit"],
            "timestamp": r["timestamp"],
            "features": json.loads(r["features_json"]),
            "outcome": r["outcome"]
        })
    conn.close()
    return candidates

def register_model(version: str, details: Dict[str, Any]) -> None:
    """Save metadata for a newly trained model version."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    sql = format_sql("""
    INSERT INTO models_registry (
        version, trained_at, data_start, data_end, accuracy, precision, recall, feature_importances
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (version) DO UPDATE SET
        trained_at = EXCLUDED.trained_at,
        data_start = EXCLUDED.data_start,
        data_end = EXCLUDED.data_end,
        accuracy = EXCLUDED.accuracy,
        precision = EXCLUDED.precision,
        recall = EXCLUDED.recall,
        feature_importances = EXCLUDED.feature_importances
    """ if DB_ENGINE == "postgres" else """
    INSERT OR REPLACE INTO models_registry (
        version, trained_at, data_start, data_end, accuracy, precision, recall, feature_importances
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """)
    
    cursor.execute(sql, (
        version,
        details.get("trained_at", datetime.utcnow().isoformat()),
        details.get("data_start", ""),
        details.get("data_end", ""),
        details.get("accuracy", 0.0),
        details.get("precision", 0.0),
        details.get("recall", 0.0),
        json.dumps(details.get("feature_importances", {}))
    ))
    
    conn.commit()
    conn.close()

def get_latest_model_meta() -> Optional[Dict[str, Any]]:
    """Retrieve metadata of the newest registered model."""
    conn = get_db_connection()
    cursor = conn.cursor()
    sql = format_sql("SELECT * FROM models_registry ORDER BY trained_at DESC LIMIT 1")
    cursor.execute(sql)
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return {
            "version": row["version"],
            "trained_at": row["trained_at"],
            "data_start": row["data_start"],
            "data_end": row["data_end"],
            "accuracy": row["accuracy"],
            "precision": row["precision"],
            "recall": row["recall"],
            "feature_importances": json.loads(row["feature_importances"])
        }
    return None

def expire_old_signals() -> None:
    """Mark any pending or active signals from previous database sessions as EXPIRED."""
    conn = get_db_connection()
    cursor = conn.cursor()
    sql = format_sql("UPDATE signals SET status = 'EXPIRED' WHERE status IN ('PENDING', 'ACTIVE')")
    cursor.execute(sql)
    conn.commit()
    conn.close()

