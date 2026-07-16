export interface Settings {
  twelvedata_api_key: string;
  telegram_bot_token: string;
  telegram_chat_id: string;
  
  asian_start: string;
  asian_end: string;
  ny_start: string;
  ny_end: string;
  allow_london: boolean;
  allow_rollover: boolean;
  
  trend_timeframe: string;
  trend_ema_fast: number;
  trend_ema_slow: number;
  
  entry_timeframe: string;
  entry_ema_fast: number;
  entry_ema_slow: number;
  rsi_period: number;
  rsi_overbought: number;
  rsi_oversold: number;
  atr_period: number;
  atr_multiplier: number;
  atr_threshold: number;
  ml_confidence_cutoff: number;
  
  account_balance: number;
  risk_percent: number;
  max_daily_loss_percent: number;
  max_weekly_loss_percent: number;
}

export interface Signal {
  id?: number;
  pair: string;
  direction: 'BUY' | 'SELL';
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  risk_reward: number;
  lot_size: number;
  session: string;
  timestamp: string;
  confluence_reasons: string[];
  confidence_score: number;
  status: 'PENDING' | 'ACTIVE' | 'WIN' | 'LOSS' | 'CANCELLED';
  exit_price?: number;
  exit_timestamp?: string;
  r_multiple?: number;
  pnl?: number;
  ml_confidence_score?: number;
  ml_version?: string;
  is_ml_approved?: boolean;
}

export interface Stats {
  total_trades: number;
  win_rate: number;
  avg_win_r: number;
  avg_loss_r: number;
  net_r: number;
  wins: number;
  losses: number;
  active_signal: Signal | null;
}

export interface BacktestRunMetrics {
  win_rate: number;
  total_trades: number;
  max_drawdown: number;
  average_r: number;
  net_r: number;
  equity_curve: { time: string; balance: number }[];
}

export interface BacktestResult {
  rules_only: BacktestRunMetrics;
  rules_ml: BacktestRunMetrics;
  trades: {
    timestamp: string;
    direction: 'BUY' | 'SELL';
    entry_price: number;
    exit_price: number;
    outcome: 'WIN' | 'LOSS';
    pnl: number;
    ml_prob: number;
    ml_approved: boolean;
  }[];
}
