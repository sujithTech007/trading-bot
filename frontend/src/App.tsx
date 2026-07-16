import React, { useEffect, useState, useRef } from 'react';
import type { Settings, Signal, Stats, BacktestResult } from './types';
import { TradingViewChart } from './components/TradingViewChart';
import { ActiveSignalCard } from './components/ActiveSignalCard';
import { SignalHistoryTable } from './components/SignalHistoryTable';
import { StatsDashboard } from './components/StatsDashboard';
import { SessionClock } from './components/SessionClock';
import { SettingsPanel } from './components/SettingsPanel';
import { ModelHealthCard } from './components/ModelHealthCard';
import { TrendingUp, LayoutDashboard, Settings2, Bell } from 'lucide-react';

const API_BASE = "http://localhost:8000/api";
const WS_URL = "ws://localhost:8000/ws";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard');
  
  // Data States
  const [settings, setSettings] = useState<Settings | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [modelHealth, setModelHealth] = useState<{
    active: boolean;
    metadata: any;
    live_accuracy: number;
    total_live_signals: number;
    drift_warning: boolean;
    candidates_count: number;
    min_required: number;
  } | null>(null);
  
  // Live Price Ticker
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<'up' | 'down' | 'flat'>('flat');
  const lastPriceRef = useRef<number | null>(null);
  
  // UI States
  const [isLoading, setIsLoading] = useState(false);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // 1. Initial Load & Notification Permissions
  useEffect(() => {
    fetchInitialData();
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const fetchModelHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/model-health`);
      if (res.ok) setModelHealth(await res.json());
    } catch (e) {
      console.error("Error fetching model health stats:", e);
    }
  };

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const [settingsRes, signalsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/settings`),
        fetch(`${API_BASE}/signals`),
        fetch(`${API_BASE}/stats`)
      ]);

      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (signalsRes.ok) setSignals(await signalsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      await fetchModelHealth();
    } catch (e) {
      showToast("Failed to connect to backend server. Make sure API is running.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetrainModel = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/train-model`, { method: 'POST' });
      if (res.ok) {
        showToast("Model retrained successfully!", "success");
        await fetchModelHealth();
      } else {
        const data = await res.json();
        showToast(`Retraining failed: ${data.detail || 'Unknown error'}`, "error");
      }
    } catch (e) {
      showToast("Error running model training pipeline.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // 2. WebSocket Listener
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: any;


    const connectWS = () => {
      setWsStatus('connecting');
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        setWsStatus('connected');
        console.log("WebSocket connected.");
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          
          if (payload.type === 'TICK') {
            const price = payload.data.price;
            if (lastPriceRef.current !== null) {
              if (price > lastPriceRef.current) setPriceChange('up');
              else if (price < lastPriceRef.current) setPriceChange('down');
            }
            setLivePrice(price);
            lastPriceRef.current = price;
          } 
          
          else if (payload.type === 'NEW_SIGNAL') {
            const newSignal: Signal = payload.data;
            setSignals(prev => [newSignal, ...prev]);
            
            // Update stats active signal
            setStats(prev => prev ? { ...prev, active_signal: newSignal } : null);
            
            // Trigger browser notification
            triggerBrowserNotification(newSignal);
            showToast(`New ${newSignal.direction} Signal generated for Gold!`, "success");
            
            // Refresh stats to ensure correct drawdown meters
            refreshStats();
          } 
          
          else if (payload.type === 'SIGNAL_UPDATE') {
            const updated = payload.data;
            setSignals(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
            
            // If active signal was updated, refresh stats to clear it/update metrics
            refreshStats();
            showToast(`Signal #${updated.id} closed as ${updated.status}!`, "info");
          }
        } catch (e) {
          console.error("Error processing websocket payload:", e);
        }
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        reconnectTimer = setTimeout(() => {
          connectWS();
        }, 5000); // retry reconnect after 5s
      };

      ws.onerror = (e) => {
        console.error("WebSocket encountered error:", e);
        ws.close();
      };
    };

    connectWS();

    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimer);
    };
  }, []);

  const refreshStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      if (res.ok) setStats(await res.json());
      
      const sigs = await fetch(`${API_BASE}/signals`);
      if (sigs.ok) setSignals(await sigs.json());
      
      await fetchModelHealth();
    } catch (e) {
      console.error("Error refreshing dashboard stats:", e);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const triggerBrowserNotification = (signal: Signal) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`🎯 GOLD SIGNAL DESK ALERT: ${signal.direction}`, {
        body: `XAUUSD Entry: $${signal.entry_price} | SL: $${signal.stop_loss} | TP: $${signal.take_profit} | Lots: ${signal.lot_size}`,
        silent: false
      });
    }
  };

  // 3. API Submissions
  const handleSaveSettings = async (updatedSettings: Settings) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: updatedSettings })
      });
      if (res.ok) {
        setSettings(await res.json());
        showToast("Configurations updated successfully!", "success");
        setActiveTab('dashboard');
        refreshStats();
      } else {
        showToast("Failed to save settings.", "error");
      }
    } catch (e) {
      showToast("Error updating settings parameters.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestTelegram = async (token: string, chatId: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/test-telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, chat_id: chatId })
      });
      if (res.ok) {
        const data = await res.json();
        return data.success;
      }
      return false;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const handleTriggerMock = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/trigger-mock-signal`, { method: 'POST' });
      if (res.ok) {
        showToast("Mock signal successfully emitted!", "success");
      } else {
        showToast("Failed to emit mock signal.", "error");
      }
    } catch (e) {
      showToast("Error triggering strategy mock.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunBacktest = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/backtest`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setBacktestResult(data);
        showToast("Historical Backtest simulation completed!", "success");
      } else {
        showToast("Backtester failed to run.", "error");
      }
    } catch (e) {
      showToast("Error executing backtest engine.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Live PnL calculation for safety limits
  // Compare today's database closed pnl to account size to get percentage
  const accountSize = settings?.account_balance || 100000;
  // We can calculate daily loss percent from stats if we log closed trades or fetch it directly.
  // For safety calculations, let's look at net PnL from historical metrics for today.
  // In database.py we calculate closed_pnl today. Let's estimate it from stats or closed signal items
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const closedToday = signals.filter(s => s.status === 'LOSS' && new Date(s.exit_timestamp || s.timestamp).getTime() >= todayStart);
  const totalLostToday = closedToday.reduce((sum, s) => sum + ((s.entry_price - s.stop_loss) * s.lot_size * 100), 0);
  const dailyLossPercent = (totalLostToday / accountSize) * 100;

  return (
    <div className="min-h-screen bg-[#070b13] flex flex-col selection:bg-blue-500/30 selection:text-blue-200">
      
      {/* Top Banner Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center shadow-lg shadow-amber-500/10">
            <TrendingUp className="w-5 h-5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-white uppercase">Gold Signal Desk</h1>
            <p className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">Prop Challenge Decision Support</p>
          </div>
        </div>

        {/* Live Gold Ticker Price */}
        <div className="flex items-center gap-6">
          <div className="bg-slate-900/60 border border-slate-850 px-3.5 py-1.5 rounded-xl flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">XAUUSD</span>
            <span className={`text-sm font-extrabold font-mono transition-colors duration-300 ${
              priceChange === 'up' ? 'text-emerald-400' : priceChange === 'down' ? 'text-rose-400' : 'text-slate-200'
            }`}>
              {livePrice ? `$${livePrice.toFixed(2)}` : 'Connecting...'}
            </span>
          </div>

          {/* WebSocket Server Connection status */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                wsStatus === 'connected' ? 'bg-emerald-400' : wsStatus === 'connecting' ? 'bg-amber-400' : 'bg-rose-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                wsStatus === 'connected' ? 'bg-emerald-500' : wsStatus === 'connecting' ? 'bg-amber-500' : 'bg-rose-500'
              }`}></span>
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              API Feed
            </span>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        
        {/* Navigation Tabs */}
        <div className="flex justify-between items-center bg-slate-950/40 p-1.5 rounded-xl border border-slate-900/60 self-start">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg transition-all ${
              activeTab === 'dashboard'
                ? 'bg-slate-900 text-white shadow-md border border-slate-800/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" /> Cockpit Dashboard
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg transition-all ${
              activeTab === 'settings'
                ? 'bg-slate-900 text-white shadow-md border border-slate-800/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings2 className="w-4 h-4" /> Strategy Settings
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === 'dashboard' ? (
          <div className="space-y-6">
            
            {/* Session Clock Indicator */}
            <SessionClock settings={settings} />

            {/* Trading Cockpit Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left column: Live advanced TV charting */}
              <div className="lg:col-span-2 flex flex-col justify-between">
                <TradingViewChart />
              </div>

              {/* Right column: Current Active Signal setup + ML Health Card */}
              <div className="lg:col-span-1 flex flex-col gap-6">
                <ActiveSignalCard
                  signal={stats?.active_signal || null}
                  settings={settings}
                  onTriggerMock={handleTriggerMock}
                  isLoading={isLoading}
                />
                <ModelHealthCard
                  modelHealth={modelHealth}
                  onRetrainModel={handleRetrainModel}
                  isLoading={isLoading}
                />
              </div>

            </div>

            {/* Performance Stats & Backtesting Module */}
            <StatsDashboard
              stats={stats}
              dailyLossPercent={dailyLossPercent}
              maxDailyLossLimit={settings?.max_daily_loss_percent || 5.0}
              maxDrawdownLimit={settings?.max_weekly_loss_percent || 10.0}
              backtestResult={backtestResult}
              onRunBacktest={handleRunBacktest}
              isBacktesting={isLoading}
            />

            {/* Past Signals History Logs */}
            <SignalHistoryTable signals={signals} />

          </div>
        ) : (
          <div className="rounded-2xl border border-slate-800 glass-panel p-6 shadow-lg">
            <SettingsPanel
              settings={settings}
              onSaveSettings={handleSaveSettings}
              onTestTelegram={handleTestTelegram}
              isLoading={isLoading}
            />
          </div>
        )}

      </main>

      {/* Floating Notifications System toasts */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border transition-all animate-bounce ${
          toast.type === 'success' 
            ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/20' 
            : toast.type === 'error'
              ? 'bg-rose-950/90 text-rose-300 border-rose-500/20'
              : 'bg-blue-950/90 text-blue-300 border-blue-500/20'
        }`}>
          <Bell className="w-4 h-4 shrink-0" />
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Footer copyright */}
      <footer className="border-t border-slate-900 bg-slate-950/20 py-4 px-6 text-center text-[10px] text-slate-600 font-medium">
        Gold Signal Desk • Standalone XAUUSD Strategy Engine for Funded Challenge Support
      </footer>
    </div>
  );
};
export default App;
