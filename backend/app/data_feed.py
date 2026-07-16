import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import time
import random
from typing import Optional, Dict, Any, List
from app.config import load_settings

class DataFeedService:
    def __init__(self):
        # Cache for historical candles to avoid rate limits
        self._cache: Dict[str, pd.DataFrame] = {}
        self._cache_time: Dict[str, float] = {}
        self.cache_duration = 300  # 5 minutes cache
        
        # Mock state variables
        self.mock_current_price = 2350.0  # Starting gold price
        self.mock_candles_m5: List[Dict[str, Any]] = []
        self.mock_candles_m15: List[Dict[str, Any]] = []
        self.mock_candles_h1: List[Dict[str, Any]] = []
        self.mock_candles_h4: List[Dict[str, Any]] = []
        self.last_mock_tick_time = time.time()
        self._initialize_mock_data()

    def _initialize_mock_data(self):
        """Pre-populate mock data with realistic historical 5M bars."""
        now = datetime.utcnow()
        temp_price = 2330.0
        self.mock_candles_m5 = []
        
        # Seed 600 bars (50 hours of 5-minute data)
        for i in range(600, 0, -1):
            bar_time = now - timedelta(minutes=5 * i)
            hour = bar_time.hour
            is_active = (0 <= hour <= 8) or (13 <= hour <= 21)
            volatility = 2.5 if is_active else 0.8
            
            # Walk with slight upward drift
            change = random.gauss(0.04, volatility)
            open_p = temp_price
            close_p = open_p + change
            high_p = max(open_p, close_p) + abs(random.gauss(0.2, volatility * 0.3))
            low_p = min(open_p, close_p) - abs(random.gauss(0.2, volatility * 0.3))
            
            self.mock_candles_m5.append({
                "datetime": bar_time.strftime("%Y-%m-%d %H:%M:%S"),
                "open": open_p,
                "high": high_p,
                "low": low_p,
                "close": close_p,
                "volume": int(random.uniform(200, 1000) if is_active else random.uniform(20, 120))
            })
            temp_price = close_p
        
        self.mock_current_price = temp_price
        self._rebuild_aggregates_from_m5()

    def _rebuild_aggregates_from_m5(self):
        """Aggregate M5 mock candles to form M15, H1, and H4 candles."""
        if not self.mock_candles_m5:
            return
        df_m5 = pd.DataFrame(self.mock_candles_m5)
        df_m5["datetime"] = pd.to_datetime(df_m5["datetime"])
        df_m5.set_index("datetime", inplace=True)
        
        def resample_tf(tf_str: str) -> List[Dict[str, Any]]:
            resampled = df_m5.resample(tf_str).agg({
                "open": "first",
                "high": "max",
                "low": "min",
                "close": "last",
                "volume": "sum"
            }).dropna()
            
            tf_list = []
            for dt, row in resampled.iterrows():
                tf_list.append({
                    "datetime": dt.strftime("%Y-%m-%d %H:%M:%S"),
                    "open": float(row["open"]),
                    "high": float(row["high"]),
                    "low": float(row["low"]),
                    "close": float(row["close"]),
                    "volume": int(row["volume"])
                })
            return tf_list

        self.mock_candles_m15 = resample_tf("15min")
        self.mock_candles_h1 = resample_tf("1h")
        self.mock_candles_h4 = resample_tf("4h")

    def get_live_tick(self) -> Dict[str, Any]:
        """Generate a new live tick update for Gold. Fetches live price from Yahoo Finance or falls back to simulator."""
        now = datetime.utcnow()
        try:
            # Attempt to fetch live price from Yahoo Finance query API
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            res = requests.get(
                "https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d",
                headers=headers,
                timeout=3
            )
            if res.status_code == 200:
                data = res.json()
                meta = data["chart"]["result"][0]["meta"]
                live_price = float(meta["regularMarketPrice"])
                self.mock_current_price = live_price
            else:
                utc_hour = datetime.utcnow().hour
                is_active = (0 <= utc_hour < 8) or (13 <= utc_hour < 21)
                tick_volatility = 0.25 if is_active else 0.08
                self.mock_current_price += random.gauss(0, tick_volatility)
        except Exception as e:
            utc_hour = datetime.utcnow().hour
            is_active = (0 <= utc_hour < 8) or (13 <= utc_hour < 21)
            tick_volatility = 0.25 if is_active else 0.08
            self.mock_current_price += random.gauss(0, tick_volatility)
            
        latest_m5 = self.mock_candles_m5[-1]
        latest_time = datetime.strptime(latest_m5["datetime"], "%Y-%m-%d %H:%M:%S")
        if now - latest_time >= timedelta(minutes=5):
            new_candle = {
                "datetime": now.strftime("%Y-%m-%d %H:%M:%S"),
                "open": latest_m5["close"],
                "high": max(latest_m5["close"], self.mock_current_price),
                "low": min(latest_m5["close"], self.mock_current_price),
                "close": self.mock_current_price,
                "volume": int(random.uniform(50, 150))
            }
            self.mock_candles_m5.append(new_candle)
            if len(self.mock_candles_m5) > 1000:
                self.mock_candles_m5.pop(0)
        else:
            latest_m5["close"] = self.mock_current_price
            latest_m5["high"] = max(latest_m5["high"], self.mock_current_price)
            latest_m5["low"] = min(latest_m5["low"], self.mock_current_price)
            latest_m5["volume"] += int(random.uniform(1, 3))
            
        self._rebuild_aggregates_from_m5()
                
        return {
            "symbol": "XAUUSD",
            "price": round(self.mock_current_price, 2),
            "timestamp": now.isoformat(),
            "candle": self.mock_candles_m5[-1]
        }

    def fetch_yahoo_finance_candles(self, interval: str = "15min", outputsize: int = 200) -> pd.DataFrame:
        """Fetch real-time Gold spot candles from Yahoo Finance."""
        # Map intervals
        tf = "15m"
        range_str = "5d"
        interval_lower = interval.lower()
        
        if "5" in interval_lower:
            tf = "5m"
            range_str = "5d"
        elif "15" in interval_lower:
            tf = "15m"
            range_str = "10d"
        elif "1h" in interval_lower or "60" in interval_lower:
            tf = "60m"
            range_str = "30d"
        elif "4h" in interval_lower or "240" in interval_lower:
            # Fetch 1h and resample to 4h
            df_h1 = self.fetch_yahoo_finance_candles(interval="1h", outputsize=outputsize * 4)
            df_h4 = df_h1.set_index("datetime").resample("4h").agg({
                "open": "first",
                "high": "max",
                "low": "min",
                "close": "last",
                "volume": "sum"
            }).dropna().reset_index()
            return df_h4[-outputsize:]

        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval={tf}&range={range_str}"
        res = requests.get(url, headers=headers, timeout=10)
        
        if res.status_code != 200:
            raise Exception(f"Yahoo Finance API error (HTTP {res.status_code})")
            
        data = res.json()
        result = data["chart"]["result"][0]
        timestamps = result["timestamp"]
        quote = result["indicators"]["quote"][0]
        
        opens = quote["open"]
        highs = quote["high"]
        lows = quote["low"]
        closes = quote["close"]
        volumes = quote["volume"]
        
        candles = []
        for i in range(len(timestamps)):
            if opens[i] is None or highs[i] is None or lows[i] is None or closes[i] is None:
                continue
            candles.append({
                "datetime": datetime.utcfromtimestamp(timestamps[i]),
                "open": float(opens[i]),
                "high": float(highs[i]),
                "low": float(lows[i]),
                "close": float(closes[i]),
                "volume": int(volumes[i]) if volumes[i] is not None else 0
            })
            
        df = pd.DataFrame(candles)
        df = df.sort_values("datetime").reset_index(drop=True)
        return df[-outputsize:]

    def fetch_ohlcv(self, interval: str = "15min", outputsize: int = 200) -> pd.DataFrame:
        """Fetch historical candles. Uses TwelveData API or falls back to Yahoo Finance."""
        settings = load_settings()
        api_key = settings.twelvedata_api_key
        
        cache_key = f"{interval}_{outputsize}"
        now_ts = time.time()
        if cache_key in self._cache and (now_ts - self._cache_time.get(cache_key, 0)) < self.cache_duration:
            return self._cache[cache_key]
            
        if not api_key:
            df = self.fetch_yahoo_finance_candles(interval, outputsize)
            self._cache[cache_key] = df
            self._cache_time[cache_key] = now_ts
            return df
            
        try:
            td_interval = "5min"
            if "15" in interval:
                td_interval = "15min"
            elif "1h" in interval or "60" in interval:
                td_interval = "1h"
            elif "4h" in interval or "240" in interval:
                td_interval = "4h"
                
            url = f"https://api.twelvedata.com/time_series?symbol=XAU/USD&interval={td_interval}&outputsize={outputsize}&apikey={api_key}"
            
            res = requests.get(url, timeout=10)
            data = res.json()
            
            if "values" not in data:
                print(f"TwelveData API Error: {data.get('message', 'Unknown error')}. Falling back to Yahoo Finance.")
                return self.fetch_yahoo_finance_candles(interval, outputsize)
                
            values = data["values"]
            df = pd.DataFrame(values)
            
            df["open"] = pd.to_numeric(df["open"])
            df["high"] = pd.to_numeric(df["high"])
            df["low"] = pd.to_numeric(df["low"])
            df["close"] = pd.to_numeric(df["close"])
            df["volume"] = pd.to_numeric(df["volume"])
            df["datetime"] = pd.to_datetime(df["datetime"])
            
            df = df.sort_values("datetime").reset_index(drop=True)
            
            self._cache[cache_key] = df
            self._cache_time[cache_key] = now_ts
            return df
            
        except Exception as e:
            print(f"Error fetching from TwelveData: {e}. Using Yahoo Finance.")
            return self.fetch_yahoo_finance_candles(interval, outputsize)

    def _get_mock_df(self, interval: str, outputsize: int) -> pd.DataFrame:
        """Helper to return simulator candles as a pandas DataFrame."""
        interval_lower = interval.lower()
        if "4h" in interval_lower or "240" in interval_lower:
            source_list = self.mock_candles_h4
        elif "1h" in interval_lower or "60" in interval_lower:
            source_list = self.mock_candles_h1
        elif "15" in interval_lower:
            source_list = self.mock_candles_m15
        else:
            source_list = self.mock_candles_m5
            
        data = source_list[-outputsize:]
        df = pd.DataFrame(data)
        df["open"] = df["open"].astype(float)
        df["high"] = df["high"].astype(float)
        df["low"] = df["low"].astype(float)
        df["close"] = df["close"].astype(float)
        df["volume"] = df["volume"].astype(int)
        df["datetime"] = pd.to_datetime(df["datetime"])
        return df

data_feed = DataFeedService()
