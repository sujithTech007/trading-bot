import os
import json
from pydantic import BaseModel
from typing import Dict, Any

# Define the structure of our application settings
class Settings(BaseModel):
    # API & Alerts Keys
    twelvedata_api_key: str = ""
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    
    # Session Filtering (UTC)
    asian_start: str = "00:00"
    asian_end: str = "08:00"
    ny_start: str = "13:00"
    ny_end: str = "21:00"
    allow_london: bool = False
    allow_rollover: bool = False
    
    # Higher Timeframe Trend (H4)
    trend_timeframe: str = "4h"
    trend_ema_fast: int = 50
    trend_ema_slow: int = 200
    
    # Entry Trigger (M15)
    entry_timeframe: str = "15min"
    entry_ema_fast: int = 9
    entry_ema_slow: int = 21
    rsi_period: int = 14
    rsi_overbought: float = 70.0
    rsi_oversold: float = 30.0
    atr_period: int = 14
    atr_multiplier: float = 2.0
    atr_threshold: float = 1.5  # Gold ATR threshold in USD
    ml_confidence_cutoff: float = 0.65  # Minimum ML probability to approve signal

    
    # Risk Management
    account_balance: float = 100000.0
    risk_percent: float = 1.0  # 1% risk per trade
    max_daily_loss_percent: float = 5.0  # Prop firm limit (5% daily drawdown)
    max_weekly_loss_percent: float = 10.0  # Prop firm limit (10% max drawdown)

# Paths for persisting settings
CONFIG_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE_PATH = os.path.join(CONFIG_DIR, "..", "settings.json")

def load_settings() -> Settings:
    """Load settings from settings.json or return default settings if not found."""
    if os.path.exists(CONFIG_FILE_PATH):
        try:
            with open(CONFIG_FILE_PATH, "r") as f:
                data = json.load(f)
                return Settings(**data)
        except Exception as e:
            print(f"Error loading settings: {e}. Using defaults.")
    
    # Return defaults if file doesn't exist or loading fails
    default_settings = Settings()
    save_settings(default_settings)
    return default_settings

def save_settings(settings: Settings) -> None:
    """Save settings to settings.json."""
    try:
        os.makedirs(os.path.dirname(CONFIG_FILE_PATH), exist_ok=True)
        with open(CONFIG_FILE_PATH, "w") as f:
            f.write(settings.model_dump_json(indent=4))
    except Exception as e:
        print(f"Error saving settings: {e}")

def update_settings(updates: Dict[str, Any]) -> Settings:
    """Update setting values and persist them."""
    current = load_settings()
    current_dict = current.model_dump()
    
    # Only update valid fields
    for k, v in updates.items():
        if k in current_dict:
            # Cast values to the correct type based on the schema
            field_type = Settings.model_fields[k].annotation
            try:
                if field_type == bool and isinstance(v, str):
                    current_dict[k] = v.lower() in ("true", "1", "yes")
                elif field_type == float:
                    current_dict[k] = float(v)
                elif field_type == int:
                    current_dict[k] = int(v)
                else:
                    current_dict[k] = v
            except (ValueError, TypeError):
                print(f"Failed to cast field {k} with value {v} to {field_type}")
                
    updated_settings = Settings(**current_dict)
    save_settings(updated_settings)
    return updated_settings
