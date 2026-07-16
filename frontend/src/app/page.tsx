"use client";

import React, { useEffect, useState, useRef } from 'react';
import type { Settings, Signal, Stats, BacktestResult } from '../types';
import { TradingViewLightweightChart } from '../components/TradingViewLightweightChart';
import { ActiveSignalCard } from '../components/ActiveSignalCard';
import { SignalHistoryTable } from '../components/SignalHistoryTable';
import { StatsDashboard } from '../components/StatsDashboard';
import { SessionClock } from '../components/SessionClock';
import { SettingsPanel } from '../components/SettingsPanel';
import { ModelHealthCard } from '../components/ModelHealthCard';
import { TrendingUp, LayoutDashboard, Settings2, ShieldCheck, AlertCircle } from 'lucide-react';

const API_BASE = "http://localhost:8000/api";
const WS_URL = "ws://localhost:8000/ws";

export default function Home() {
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

  // 1. Initial Load
  useEffect(() => {
    fetchInitialData();
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
        showToast("XGBoost Model retrained successfully!", "success");
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
            
            // Only update dashboard signal lists if confidence matches standard (>85)
            if (newSignal.confidence_score >= 85) {
              setSignals(prev => [newSignal, ...prev]);
              setStats(prev => prev ? { ...prev, active_signal: newSignal } : null);
              showToast(`New XAUUSD SMC Signal Generated!`, "success");
              refreshStats();
            }
          } 
          
          else if (payload.type === 'SIGNAL_UPDATE') {
            const updated = payload.data;
            setSignals(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
            refreshStats();
            showToast(`SMC Setup #${updated.id} closed as ${updated.status}!`, "info");
          }
        } catch (e) {
          console.error("Error processing websocket payload:", e);
        }
      };

      ws.onclose = () => {
        setWsStatus('disconnected');
        reconnectTimer = setTimeout(() => {
          connectWS();
        }, 5500);
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
        showToast("SMC Strategy Configurations saved!", "success");
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
        showToast("Mock high-confidence SMC setup injected!", "success");
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

  // Dynamic Risk calculations
  const accountSize = settings?.account_balance || 100000;
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const closedToday = signals.filter(s => s.status === 'LOSS' && new Date(s.exit_timestamp || s.timestamp).getTime() >= todayStart);
  const totalLostToday = closedToday.reduce((sum, s) => sum + ((s.entry_price - s.stop_loss) * s.lot_size * 100), 0);
  const dailyLossPercent = (totalLostToday / accountSize) * 100;

  // Active Signal Calculations
  const activeSignal = stats?.active_signal || null;
  const isSMCApproved = activeSignal && activeSignal.confidence_score >= 85;

  // AI Explanation Construction
  const explanationText = activeSignal && isSMCApproved
    ? `${activeSignal.direction} setup detected because: ${activeSignal.confluence_reasons.join(', ')}. Risk-to-reward ratio is 1:${activeSignal.risk_reward.toFixed(1)}.`
    : null;

  return (
    <div className="min-h-screen bg-[#070b13] flex flex-col selection:bg-blue-500/30 selection:text-blue-200">
      
      {/* Top Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center shadow-lg shadow-amber-500/10">
            <TrendingUp className="w-5 h-5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white uppercase">XAUUSD Smart Trade Assistant</h1>
            <p className="text-[10px] text-slate-500 font-semibold uppercase">AI SMC Analysis System</p>
          </div>
        </div>

        {/* Live Ticker and Websocket Status */}
        <div className="flex items-center gap-6">
          
          {/* WS Status Dot */}
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              wsStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : wsStatus === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'
            }`} />
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
              {wsStatus === 'connected' ? 'LIVE DATASTREAM' : wsStatus === 'connecting' ? 'RECONNECTING' : 'OFFLINE'}
            </span>
          </div>

          {/* Ticker */}
          <div className="bg-slate-900/60 border border-slate-800 px-3.5 py-1.5 rounded-xl text-right min-w-[130px]">
            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">GOLD SPOT</div>
            <div className={`text-sm font-extrabold font-mono transition-colors duration-300 ${
              priceChange === 'up' ? 'text-emerald-450' : priceChange === 'down' ? 'text-rose-450' : 'text-slate-200'
            }`}>
              {livePrice ? `$${livePrice.toFixed(2)}` : 'Connecting...'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        
        {/* Navigation Toggles */}
        <div className="flex gap-2.5 border-b border-slate-900 pb-4">
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
            
            {/* Session Indicator */}
            <SessionClock settings={settings} />

            {/* Trading Cockpit Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Lightweight TV Charts */}
              <div className="lg:col-span-2 flex flex-col justify-between">
                <TradingViewLightweightChart 
                  activeSignal={activeSignal && isSMCApproved ? activeSignal : null}
                  livePrice={livePrice}
                />
              </div>

              {/* Right Column: Active Setup Panel */}
              <div className="lg:col-span-1 flex flex-col gap-6">
                
                {/* Active SMC Signal Card */}
                {activeSignal && isSMCApproved ? (
                  <div className="flex flex-col gap-4">
                    <ActiveSignalCard
                      signal={activeSignal}
                      settings={settings}
                      onTriggerMock={handleTriggerMock}
                      isLoading={isLoading}
                    />
                    
                    {/* Dynamic AI Explanation block */}
                    {explanationText && (
                      <div className="rounded-2xl border border-blue-900/35 bg-blue-950/25 p-4 text-[11px] leading-relaxed text-blue-300 flex gap-2">
                        <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-blue-200">AI Setup Analyst: </strong>
                          {explanationText}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-850 bg-slate-900/10 p-6 flex flex-col items-center justify-center text-center h-[340px] shadow-lg relative overflow-hidden">
                    {/* Glowing gold background circle */}
                    <div className="absolute w-44 h-44 rounded-full bg-amber-500/5 blur-3xl -top-10 -right-10 pointer-events-none" />
                    
                    <AlertCircle className="w-12 h-12 text-slate-650 mb-3 animate-pulse-slow" />
                    <h3 className="text-slate-300 font-bold text-sm tracking-wide uppercase">No Setup Active</h3>
                    <p className="text-amber-500 font-semibold text-[10px] uppercase tracking-widest mt-1">
                      Waiting for High Probability Setup
                    </p>
                    <p className="text-[10px] text-slate-500 max-w-[250px] mt-2.5">
                      The SMC scanner is actively parsing 4H trend structure and scanning 15M/5M order blocks. Signals with confidence &lt; 85% are suppressed.
                    </p>
                    
                    <button
                      onClick={handleTriggerMock}
                      disabled={isLoading}
                      className="mt-6 border border-slate-800 hover:border-slate-700 bg-slate-900/40 text-slate-350 hover:text-slate-200 text-[10px] font-bold py-2 px-4 rounded-xl cursor-pointer active:scale-95 transition-all"
                    >
                      Inject Mock SMC Setup
                    </button>
                  </div>
                )}

                {/* Layer 2 XGBoost Model Health panel */}
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
          <SettingsPanel
            settings={settings}
            onSaveSettings={handleSaveSettings}
            onTestTelegram={handleTestTelegram}
            isLoading={isLoading}
          />
        )}

      </main>

      {/* Floating Alerts Toasts */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl border text-xs shadow-2xl z-50 flex items-center gap-2 animate-bounce ${
          toast.type === 'success' ? 'bg-emerald-950 text-emerald-300 border-emerald-500/20' :
          toast.type === 'error' ? 'bg-rose-950 text-rose-300 border-rose-500/20' :
          'bg-slate-900 text-slate-300 border-slate-750'
        }`}>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Footer copyright */}
      <footer className="border-t border-slate-950 bg-slate-950/40 py-4 text-center text-[10px] text-slate-650">
        XAUUSD Smart Trade Assistant • Built with Next.js App Router & FastAPI
      </footer>

    </div>
  );
}
