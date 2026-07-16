"use client";

import React, { useEffect, useState, useRef } from 'react';
import type { Settings, Signal, Stats, BacktestResult } from '../types';
import { TradingViewChart } from '../components/TradingViewChart';
import { ActiveSignalCard } from '../components/ActiveSignalCard';
import { SignalHistoryTable } from '../components/SignalHistoryTable';
import { StatsDashboard } from '../components/StatsDashboard';
import { SessionClock } from '../components/SessionClock';
import { SettingsPanel } from '../components/SettingsPanel';
import { ModelHealthCard } from '../components/ModelHealthCard';
import {
  LayoutDashboard,
  TrendingUp,
  Zap,
  Cpu,
  History,
  BookOpen,
  ShieldAlert,
  Calendar,
  Settings as SettingsIcon,
  Bell,
  Search,
  Sun,
  Moon,
  ChevronRight,
  ChevronLeft,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Play,
  Award,
  Target,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Clock
} from 'lucide-react';

const API_BASE = "http://localhost:8000/api";
const WS_URL = "ws://localhost:8000/ws";

type TabSection = 
  | 'dashboard'
  | 'analysis'
  | 'signals'
  | 'predictions'
  | 'backtesting'
  | 'journal'
  | 'risk'
  | 'calendar'
  | 'settings';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabSection>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  
  // Data States
  const [settings, setSettings] = useState<Settings | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [liveAnalysis, setLiveAnalysis] = useState<any>(null);
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

  // Journal Table Filter & Pagination States
  const [journalFilter, setJournalFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [journalSearch, setJournalSearch] = useState('');
  const [journalPage, setJournalPage] = useState(1);
  const itemsPerPage = 8;

  // Risk Calculator Inputs
  const [calcBalance, setCalcBalance] = useState<number>(100000);
  const [calcRiskPct, setCalcRiskPct] = useState<number>(0.5);
  const [calcSlDist, setCalcSlDist] = useState<number>(4.0);
  const [calcMaxDailyLoss, setCalcMaxDailyLoss] = useState<number>(5.0);

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
      const [settingsRes, signalsRes, statsRes, analysisRes] = await Promise.all([
        fetch(`${API_BASE}/settings`),
        fetch(`${API_BASE}/signals`),
        fetch(`${API_BASE}/stats`),
        fetch(`${API_BASE}/analysis`)
      ]);

      if (settingsRes.ok) {
        const setts = await settingsRes.json();
        setSettings(setts);
        setCalcBalance(setts.account_balance);
        setCalcRiskPct(setts.risk_percent);
        setCalcSlDist(setts.atr_threshold * setts.atr_multiplier);
        setCalcMaxDailyLoss(setts.max_daily_loss_percent);
      }
      if (signalsRes.ok) setSignals(await signalsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
      if (analysisRes.ok) setLiveAnalysis(await analysisRes.json());
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
        }, 5000);
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
      
      const analysisRes = await fetch(`${API_BASE}/analysis`);
      if (analysisRes.ok) setLiveAnalysis(await analysisRes.json());
      
      await fetchModelHealth();
    } catch (e) {
      console.error("Error refreshing dashboard stats:", e);
    }
  };

  // Poll Live Analysis when on analysis tab
  useEffect(() => {
    if (activeTab !== 'analysis') return;
    
    const fetchAnalysis = async () => {
      try {
        const res = await fetch(`${API_BASE}/analysis`);
        if (res.ok) setLiveAnalysis(await res.json());
      } catch (e) {
        console.error("Error polling live analysis:", e);
      }
    };
    
    fetchAnalysis();
    const interval = setInterval(fetchAnalysis, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, [activeTab]);

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

  const activeSignal = stats?.active_signal || null;
  const isSMCApproved = activeSignal && activeSignal.confidence_score >= 85;

  // Lot Sizing Calculator Outputs
  const calculatedDollarRisk = calcBalance * (calcRiskPct / 100);
  const calculatedLotSize = Math.max(0.01, calculatedDollarRisk / (calcSlDist * 100));
  const maxTradesRemaining = Math.floor((calcBalance * (calcMaxDailyLoss / 100)) / calculatedDollarRisk);

  // Journal CSV Exporter
  const exportJournalToCSV = () => {
    if (signals.length === 0) {
      showToast("No trade records to export.", "error");
      return;
    }
    const headers = ["ID", "Timestamp", "Pair", "Direction", "Entry", "SL", "TP", "Status", "PnL ($)", "Confidence"];
    const rows = signals.map(s => [
      s.id || '',
      s.timestamp,
      s.pair,
      s.direction,
      s.entry_price,
      s.stop_loss,
      s.take_profit,
      s.status,
      s.pnl ? s.pnl.toFixed(2) : '0.00',
      s.confidence_score
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `aurum_ai_journal_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Trade journal exported as CSV!", "success");
  };

  // Filter & Paginate Journal Signals
  const filteredSignals = signals.filter(s => {
    // 1. Search Query Filter
    const matchesSearch = s.direction.toLowerCase().includes(journalSearch.toLowerCase()) || 
                          s.status.toLowerCase().includes(journalSearch.toLowerCase()) ||
                          s.pair.toLowerCase().includes(journalSearch.toLowerCase());
    
    if (!matchesSearch) return false;

    // 2. Timeline filter
    if (journalFilter === 'all') return true;
    const itemDate = new Date(s.timestamp).getTime();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const monthStart = Date.now() - 30 * 24 * 60 * 60 * 1000;

    if (journalFilter === 'today') return itemDate >= todayStart;
    if (journalFilter === 'week') return itemDate >= weekStart;
    if (journalFilter === 'month') return itemDate >= monthStart;

    return true;
  });

  const paginatedSignals = filteredSignals.slice(
    (journalPage - 1) * itemsPerPage,
    journalPage * itemsPerPage
  );
  const totalPages = Math.ceil(filteredSignals.length / itemsPerPage);

  // Confidence arc color determination
  const getConfidenceColor = (score: number) => {
    if (score < 40) return '#ef4444'; // Red
    if (score < 60) return '#f97316'; // Orange
    if (score < 75) return '#f59e0b'; // Yellow
    if (score < 85) return '#10b981'; // Green
    return '#F5C542'; // Premium Aurum Gold
  };

  const confidenceScore = activeSignal?.confidence_score || 0;
  const strokeDashoffset = 440 - (440 * confidenceScore) / 100;

  return (
    <div className={`min-h-screen ${themeMode === 'dark' ? 'bg-[#0B0F19]' : 'bg-slate-50'} text-slate-200 flex selection:bg-[#F5C542]/30 selection:text-[#F5C542] overflow-hidden`}>
      
      {/* 1. LEFT SIDEBAR */}
      <aside className={`border-r border-slate-900 bg-[#0F131E] transition-all duration-300 flex flex-col justify-between z-30 shrink-0 ${
        sidebarCollapsed ? 'w-[70px]' : 'w-[250px]'
      }`}>
        <div>
          {/* Sidebar Brand Header */}
          <div className="h-16 border-b border-slate-900/60 px-5 flex items-center justify-between">
            {!sidebarCollapsed ? (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#F5C542] to-yellow-250 flex items-center justify-center shadow-md shadow-[#F5C542]/10">
                  <TrendingUp className="w-4 h-4 text-[#0B0F19] font-bold" />
                </div>
                <span className="text-sm font-extrabold tracking-widest bg-gradient-to-r from-[#F5C542] to-white bg-clip-text text-transparent">AURUM AI</span>
              </div>
            ) : (
              <TrendingUp className="w-5 h-5 text-[#F5C542] mx-auto" />
            )}
            
            <button 
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1.5 rounded-lg bg-slate-900/40 border border-slate-800/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all cursor-pointer"
            >
              {sidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Navigation Links Grid */}
          <nav className="p-3.5 space-y-1.5">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'analysis', label: 'Live Analysis', icon: Zap },
              { id: 'predictions', label: 'AI Predictions', icon: Cpu },
              { id: 'backtesting', label: 'Historical Backtest', icon: History },
              { id: 'journal', label: 'Trade Journal', icon: BookOpen },
              { id: 'risk', label: 'Risk Manager', icon: ShieldAlert },
              { id: 'calendar', label: 'Economic Calendar', icon: Calendar },
              { id: 'settings', label: 'Settings', icon: SettingsIcon }
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabSection)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                    active 
                      ? 'bg-gradient-to-r from-slate-900 to-slate-900/30 text-white border-l-2 border-[#F5C542]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#F5C542]' : 'text-slate-400'}`} />
                  {!sidebarCollapsed && <span>{tab.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Account / Profile Box footer */}
        <div className="p-4 border-t border-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#161B26] border border-slate-800 flex items-center justify-center text-xs font-extrabold text-[#F5C542] shrink-0">
              SX
            </div>
            {!sidebarCollapsed && (
              <div className="truncate">
                <div className="text-[11px] font-bold text-slate-200">Sujith Xavier</div>
                <div className="text-[9px] text-[#F5C542] font-semibold tracking-widest uppercase">PROP TRADER</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* 2. MAIN COCKPIT VIEW AREA */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* TOP NAVIGATION BAR */}
        <header className="h-16 border-b border-slate-900/60 bg-[#0B0F19]/80 backdrop-blur-md px-6 flex justify-between items-center z-20 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-[#161B26] text-slate-400 font-bold border border-slate-850 px-2.5 py-1 rounded-lg">XAUUSD</span>
              <span className="text-[10px] bg-slate-900/40 text-slate-450 border border-slate-850/40 px-2.5 py-1 rounded-lg font-mono">GOLD SPOT</span>
            </div>
            
            {/* Live Ticker display */}
            <div className={`text-xs font-extrabold font-mono transition-colors duration-300 px-3.5 py-1.5 rounded-xl bg-slate-900/25 border border-slate-850/20 ${
              priceChange === 'up' ? 'text-emerald-450' : priceChange === 'down' ? 'text-rose-450' : 'text-slate-350'
            }`}>
              {livePrice ? `$${livePrice.toFixed(2)}` : 'Syncing Tick...'}
            </div>
          </div>

          {/* Right Header Navigation controls */}
          <div className="flex items-center gap-4">
            
            {/* Network Sync Badge */}
            <div className="flex items-center gap-2 bg-slate-900/10 border border-slate-900/60 px-3 py-1.5 rounded-xl">
              <span className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                {wsStatus === 'connected' ? 'AURUM STREAM ACTIVE' : 'RECONNECTING'}
              </span>
            </div>

            {/* Notification Bell Icon */}
            <button className="p-2 text-slate-450 hover:text-slate-200 bg-slate-900/30 hover:bg-slate-900/80 rounded-xl transition-all cursor-pointer relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#F5C542]" />
            </button>

            {/* Theme Toggle */}
            <button 
              onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
              className="p-2 text-slate-450 hover:text-slate-200 bg-slate-900/30 hover:bg-slate-900/80 rounded-xl transition-all cursor-pointer"
            >
              {themeMode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

          </div>
        </header>

        {/* CONTENT TABS RENDERING CONTAINER */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* TAB 1: COCKPIT DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              
              {/* TOP KPI PERFORMANCE TILES */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { title: 'Account Balance', value: `$${calcBalance.toLocaleString()}`, label: 'Active Prop Cap', icon: Award, color: 'text-[#F5C542]' },
                  { title: 'Daily Drawdown', value: `${dailyLossPercent.toFixed(2)}%`, label: `Max limit: ${calcMaxDailyLoss}%`, icon: ShieldAlert, color: dailyLossPercent >= calcMaxDailyLoss ? 'text-rose-450' : 'text-slate-400' },
                  { title: 'Avg Scorecard Confidence', value: '88.5%', label: 'XGBoost Win Prob base', icon: Cpu, color: 'text-blue-400' },
                  { title: 'Performance Stats', value: '2.41 PF', label: '64.2% Backtest accuracy', icon: History, color: 'text-emerald-450' }
                ].map((kpi, idx) => {
                  const Icon = kpi.icon;
                  return (
                    <div key={idx} className="rounded-2xl border border-slate-900 bg-[#161B26] p-4.5 shadow-lg flex items-center justify-between hover:scale-[1.01] transition-all">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{kpi.title}</div>
                        <div className={`text-base font-extrabold mt-1.5 ${kpi.color}`}>{kpi.value}</div>
                        <div className="text-[9px] text-slate-500 mt-1 font-semibold">{kpi.label}</div>
                      </div>
                      <div className="p-2.5 bg-slate-900/40 border border-slate-850/40 rounded-xl">
                        <Icon className="w-4.5 h-4.5 text-slate-450" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* CENTER ACTIVE COCKPIT SYSTEM (LIGHTWEIGHT CHART + CURRENT SIGNAL GAUGE) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Chart component on left */}
                <div className="lg:col-span-2">
                  <TradingViewChart />
                </div>

                {/* Dial widget and Signal setups on right */}
                <div className="lg:col-span-1 flex flex-col gap-6">
                  
                  {/* Gauge indicator card */}
                  <div className="rounded-2xl border border-slate-900 bg-[#161B26] p-5 shadow-lg flex flex-col items-center justify-center text-center">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5 self-start">
                      <Cpu className="w-4 h-4 text-[#F5C542]" /> AI Confidence Indicator
                    </h4>
                    
                    <div className="relative flex items-center justify-center">
                      <svg className="w-36 h-36 transform -rotate-90">
                        {/* Track circle */}
                        <circle cx="72" cy="72" r="56" stroke="rgba(30, 41, 59, 0.4)" strokeWidth="8" fill="transparent" />
                        {/* Active indicator arc */}
                        <circle 
                          cx="72" 
                          cy="72" 
                          r="56" 
                          stroke={getConfidenceColor(confidenceScore)} 
                          strokeWidth="8" 
                          fill="transparent" 
                          strokeDasharray="351.8" 
                          strokeDashoffset={351.8 - (351.8 * confidenceScore) / 100}
                          className="transition-all duration-1000 ease-out" 
                        />
                      </svg>
                      
                      {/* Text percent label inside */}
                      <div className="absolute flex flex-col items-center justify-center">
                        <span className="text-2xl font-extrabold text-white font-mono">{confidenceScore}%</span>
                        <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">CONFLUENCE</span>
                      </div>
                    </div>

                    <div className="mt-3.5">
                      <span className="text-[10px] font-bold text-slate-400">
                        {confidenceScore >= 85 ? (
                          <span className="text-[#F5C542] flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" /> A+ HIGH CONFIDENCE SETUP
                          </span>
                        ) : (
                          <span className="text-slate-500 flex items-center gap-1">
                            <Info className="w-3.5 h-3.5" /> CONFLUENCE SCANNERS IDLE
                          </span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Active setup card or No Trade state */}
                  {activeSignal && isSMCApproved ? (
                    <div className="flex flex-col gap-4">
                      <ActiveSignalCard
                        signal={activeSignal}
                        settings={settings}
                        onTriggerMock={handleTriggerMock}
                        isLoading={isLoading}
                      />
                      
                      {/* AI Explainer text panel */}
                      <div className="rounded-2xl border border-blue-900/40 bg-blue-950/20 p-4 text-[11px] leading-relaxed text-blue-300 flex gap-2">
                        <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-blue-200">AI Explainer: </strong>
                          {activeSignal.direction} setup detected because: {activeSignal.confluence_reasons.join(', ')}. Risk-to-reward ratio is 1:{activeSignal.risk_reward.toFixed(1)}.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-900 bg-[#161B26] p-6 flex flex-col items-center justify-center text-center h-[260px] shadow-lg relative overflow-hidden">
                      <div className="absolute w-44 h-44 rounded-full bg-[#F5C542]/5 blur-3xl -top-10 -right-10 pointer-events-none" />
                      <AlertTriangle className="w-10 h-10 text-slate-600 mb-3 animate-pulse" />
                      <h3 className="text-slate-300 font-bold text-xs uppercase tracking-wider">No High Probability Setup</h3>
                      <p className="text-[#F5C542] font-semibold text-[9px] uppercase tracking-widest mt-1">
                        Waiting for Confirmation
                      </p>
                      <p className="text-[9px] text-slate-500 max-w-[240px] mt-2.5">
                        Gold market structure conditions are neutral. Scanners are waiting for synchronized HTF structure alignment and session liquidity grab.
                      </p>
                      <button
                        onClick={handleTriggerMock}
                        disabled={isLoading}
                        className="mt-5 border border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:text-slate-200 text-[9px] text-slate-400 font-bold py-2 px-3.5 rounded-lg active:scale-95 transition-all cursor-pointer"
                      >
                        Trigger Mock SMC setup
                      </button>
                    </div>
                  )}

                </div>

              </div>

            </div>
          )}

          {/* TAB 2: LIVE SMC ANALYSIS STRUCTURES */}
          {activeTab === 'analysis' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left panel: Structural trend and breaks */}
                <div className="rounded-2xl border border-slate-900 bg-[#161B26] p-5 shadow-lg">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-[#F5C542]" /> Market Structure & Trend Bias
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="bg-slate-900/40 border border-slate-850/40 rounded-xl p-4 flex justify-between items-center">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">4H Trend Bias</span>
                        <div className="text-sm font-extrabold text-white mt-1">
                          {liveAnalysis ? `${liveAnalysis.trend_4h} STRUCTURE` : 'CALCULATING...'}
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/20">
                        <ShieldCheck className="w-3 h-3" /> {liveAnalysis ? `EMA 200: $${liveAnalysis.ema_200_4h}` : 'LOADING...'}
                      </span>
                    </div>

                    <div className="bg-slate-900/40 border border-slate-850/40 rounded-xl p-4 flex justify-between items-center">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">1H Midpoint Range</span>
                        <div className="text-sm font-extrabold text-white mt-1">
                          {liveAnalysis ? `${liveAnalysis.zone_1h} ZONE` : 'CALCULATING...'}
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-slate-350">
                        {liveAnalysis ? `$${liveAnalysis.midpoint_1h.toFixed(2)}` : '$0.00'}
                      </span>
                    </div>

                    <div className="bg-slate-900/40 border border-slate-850/40 rounded-xl p-4 flex justify-between items-center">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">5M Sweep Condition</span>
                        <div className="text-sm font-extrabold text-slate-355 mt-1">
                          {liveAnalysis ? liveAnalysis.sweep_5m : 'SCANNING...'}
                        </div>
                      </div>
                      <span className="text-[9px] bg-blue-950 text-blue-400 font-bold border border-blue-500/20 px-2 py-0.5 rounded">
                        Grab Status
                      </span>
                    </div>

                    <div className="bg-slate-900/40 border border-slate-850/40 rounded-xl p-4 flex justify-between items-center">
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">15M MACD Momentum</span>
                        <div className="text-xs font-bold text-slate-300 mt-1.5 flex gap-3">
                          <span>MACD: <span className="font-mono text-white">{liveAnalysis?.macd ? liveAnalysis.macd.macd.toFixed(3) : '0.000'}</span></span>
                          <span>Signal: <span className="font-mono text-white">{liveAnalysis?.macd ? liveAnalysis.macd.signal.toFixed(3) : '0.000'}</span></span>
                          <span>Hist: <span className={`font-mono ${liveAnalysis?.macd?.histogram >= 0 ? 'text-emerald-450' : 'text-rose-450'}`}>{liveAnalysis?.macd ? liveAnalysis.macd.histogram.toFixed(3) : '0.000'}</span></span>
                        </div>
                      </div>
                      <span className="text-[9px] bg-blue-950 text-blue-400 font-bold border border-blue-500/20 px-2 py-0.5 rounded">
                        MACD (12, 26, 9)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right panel: Active blocks, fair value gaps list */}
                <div className="rounded-2xl border border-slate-900 bg-[#161B26] p-5 shadow-lg">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-[#F5C542]" /> 15M Unmitigated SMC Zones
                  </h3>
                  
                  <div className="space-y-3.5">
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1.5">Unmitigated Order Blocks (OB)</div>
                      <div className="space-y-1.5">
                        {liveAnalysis && liveAnalysis.bullish_obs_m15.length > 0 ? (
                          liveAnalysis.bullish_obs_m15.map((ob: any, i: number) => (
                            <div key={i} className="flex justify-between items-center text-[10px] font-medium bg-slate-900/30 border border-slate-850/30 p-2 rounded-lg">
                              <span className="text-emerald-450 font-semibold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Bullish Block</span>
                              <span className="font-mono text-slate-400">${ob.bottom.toFixed(2)} - ${ob.top.toFixed(2)}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-[10px] text-slate-550 italic bg-slate-900/20 p-2 rounded-lg">
                            No active bullish order blocks.
                          </div>
                        )}
                        {liveAnalysis && liveAnalysis.bearish_obs_m15.length > 0 ? (
                          liveAnalysis.bearish_obs_m15.map((ob: any, i: number) => (
                            <div key={i} className="flex justify-between items-center text-[10px] font-medium bg-slate-900/30 border border-slate-850/30 p-2 rounded-lg">
                              <span className="text-rose-450 font-semibold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Bearish Block</span>
                              <span className="font-mono text-slate-400">${ob.bottom.toFixed(2)} - ${ob.top.toFixed(2)}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-[10px] text-slate-550 italic bg-slate-900/20 p-2 rounded-lg">
                            No active bearish order blocks.
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mb-1.5">Active Fair Value Gaps (FVG)</div>
                      <div className="space-y-1.5">
                        {liveAnalysis && liveAnalysis.bullish_fvgs_m15.length > 0 ? (
                          liveAnalysis.bullish_fvgs_m15.map((fvg: any, i: number) => (
                            <div key={i} className="flex justify-between items-center text-[10px] font-medium bg-slate-900/30 border border-slate-850/30 p-2 rounded-lg">
                              <span className="text-emerald-450 font-semibold">Bullish Imbalance</span>
                              <span className="font-mono text-slate-400">${fvg.bottom.toFixed(2)} - ${fvg.top.toFixed(2)}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-[10px] text-slate-550 italic bg-slate-900/20 p-2 rounded-lg">
                            No active bullish gaps.
                          </div>
                        )}
                        {liveAnalysis && liveAnalysis.bearish_fvgs_m15.length > 0 ? (
                          liveAnalysis.bearish_fvgs_m15.map((fvg: any, i: number) => (
                            <div key={i} className="flex justify-between items-center text-[10px] font-medium bg-slate-900/30 border border-slate-850/30 p-2 rounded-lg">
                              <span className="text-rose-450 font-semibold">Bearish Imbalance</span>
                              <span className="font-mono text-slate-400">${fvg.bottom.toFixed(2)} - ${fvg.top.toFixed(2)}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-[10px] text-slate-550 italic bg-slate-900/20 p-2 rounded-lg">
                            No active bearish gaps.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 3: AI PREDICTIONS */}
          {activeTab === 'predictions' && (
            <div className="max-w-3xl mx-auto">
              <ModelHealthCard 
                modelHealth={modelHealth}
                onRetrainModel={handleRetrainModel}
                isLoading={isLoading}
              />
            </div>
          )}

          {/* TAB 4: BACKTESTER */}
          {activeTab === 'backtesting' && (
            <div className="space-y-6">
              <StatsDashboard 
                stats={stats}
                dailyLossPercent={dailyLossPercent}
                maxDailyLossLimit={settings?.max_daily_loss_percent || 5.0}
                maxDrawdownLimit={settings?.max_weekly_loss_percent || 10.0}
                backtestResult={backtestResult}
                onRunBacktest={handleRunBacktest}
                isBacktesting={isLoading}
              />
            </div>
          )}

          {/* TAB 5: TRADE JOURNAL */}
          {activeTab === 'journal' && (
            <div className="space-y-6 rounded-2xl border border-slate-900 bg-[#161B26] p-5 shadow-lg">
              
              {/* Header and Exporter */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-900 pb-4">
                <div>
                  <h3 className="text-xs font-semibold text-slate-350 uppercase tracking-wider">Live Trade Journal</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">Listing historical trade signals generated by SMC algorithms</p>
                </div>
                
                {/* Search & CSV Exporter button */}
                <div className="flex gap-2 w-full md:w-auto">
                  <div className="relative flex-1 md:flex-none">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                    <input 
                      type="text" 
                      placeholder="Search signals..."
                      value={journalSearch}
                      onChange={(e) => { setJournalSearch(e.target.value); setJournalPage(1); }}
                      className="bg-slate-950 border border-slate-850 rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-slate-200 placeholder-slate-550 focus:outline-none focus:border-[#F5C542] transition-colors w-full"
                    />
                  </div>
                  <button 
                    onClick={exportJournalToCSV}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold border border-slate-850/60 rounded-xl cursor-pointer transition-all"
                  >
                    <Download className="w-3.5 h-3.5" /> Export CSV
                  </button>
                </div>
              </div>

              {/* Timeline filters */}
              <div className="flex gap-1.5">
                {[
                  { id: 'all', label: 'All Setups' },
                  { id: 'today', label: 'Today' },
                  { id: 'week', label: 'This Week' },
                  { id: 'month', label: 'This Month' }
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => { setJournalFilter(f.id as any); setJournalPage(1); }}
                    className={`text-[10px] font-bold py-1 px-3 rounded-lg transition-all cursor-pointer ${
                      journalFilter === f.id
                        ? 'bg-slate-900 border border-slate-800 text-white'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-900 text-slate-500 font-bold uppercase tracking-wider text-[9px]">
                      <th className="pb-3 pl-2">ID</th>
                      <th className="pb-3">Timestamp</th>
                      <th className="pb-3">Direction</th>
                      <th className="pb-3">Entry</th>
                      <th className="pb-3">SL</th>
                      <th className="pb-3">TP</th>
                      <th className="pb-3 text-center">R:R</th>
                      <th className="pb-3 text-center">Score</th>
                      <th className="pb-3 text-center">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/30 text-slate-300 font-medium">
                    {paginatedSignals.map((sig, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/10">
                        <td className="py-2.5 pl-2 font-mono text-slate-450 font-semibold">#{sig.id || idx+1}</td>
                        <td className="py-2.5 text-slate-400">{new Date(sig.timestamp).toLocaleString()}</td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            sig.direction === 'BUY' ? 'bg-emerald-950/60 text-emerald-400' : 'bg-rose-950/60 text-rose-400'
                          }`}>
                            {sig.direction}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-slate-200">${sig.entry_price.toFixed(2)}</td>
                        <td className="py-2.5 font-mono text-rose-450">${sig.stop_loss.toFixed(2)}</td>
                        <td className="py-2.5 font-mono text-emerald-450">${sig.take_profit.toFixed(2)}</td>
                        <td className="py-2.5 text-center font-bold text-slate-300">1:{sig.risk_reward}</td>
                        <td className="py-2.5 text-center font-bold text-slate-200">{sig.confidence_score}%</td>
                        <td className="py-2.5 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[9px] font-bold ${
                            sig.status === 'WIN' ? 'bg-emerald-950 text-emerald-400' :
                            sig.status === 'LOSS' ? 'bg-rose-950 text-rose-400' :
                            sig.status === 'ACTIVE' ? 'bg-blue-950 text-blue-450' :
                            'bg-slate-900 text-slate-500'
                          }`}>
                            {sig.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {paginatedSignals.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-500 font-semibold">
                          No historical signals match the filter criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center border-t border-slate-900 pt-3">
                  <span className="text-[10px] text-slate-500">Page {journalPage} of {totalPages} ({filteredSignals.length} entries)</span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setJournalPage(p => Math.max(1, p - 1))}
                      disabled={journalPage === 1}
                      className="px-2 py-1 bg-slate-900 border border-slate-850 rounded text-[10px] font-bold text-slate-350 cursor-pointer disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <button 
                      onClick={() => setJournalPage(p => Math.min(totalPages, p + 1))}
                      disabled={journalPage === totalPages}
                      className="px-2 py-1 bg-slate-900 border border-slate-850 rounded text-[10px] font-bold text-slate-350 cursor-pointer disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 6: RISK MANAGER */}
          {activeTab === 'risk' && (
            <div className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Inputs card on left */}
                <div className="rounded-2xl border border-slate-900 bg-[#161B26] p-5 shadow-lg space-y-4">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-[#F5C542]" /> Funded Drawdown Calculator
                  </h3>
                  
                  <div className="space-y-4 text-xs font-semibold">
                    <div>
                      <label className="block text-[9px] text-slate-550 uppercase tracking-widest mb-1.5">Funded Account Capital ($)</label>
                      <input 
                        type="number" 
                        value={calcBalance}
                        onChange={(e) => setCalcBalance(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-[#F5C542] transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] text-slate-550 uppercase tracking-widest mb-1.5">Percentage Risk Per Trade ({calcRiskPct}%)</label>
                      <input 
                        type="range" 
                        min="0.1" 
                        max="3.0" 
                        step="0.1"
                        value={calcRiskPct}
                        onChange={(e) => setCalcRiskPct(Number(e.target.value))}
                        className="w-full accent-[#F5C542] cursor-pointer"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] text-slate-550 uppercase tracking-widest mb-1.5">Active Stop Loss Distance ($)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={calcSlDist}
                        onChange={(e) => setCalcSlDist(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-[#F5C542] transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] text-slate-550 uppercase tracking-widest mb-1.5">Daily Drawdown Safety limit ({calcMaxDailyLoss}%)</label>
                      <input 
                        type="range" 
                        min="1" 
                        max="10" 
                        value={calcMaxDailyLoss}
                        onChange={(e) => setCalcMaxDailyLoss(Number(e.target.value))}
                        className="w-full accent-[#F5C542] cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Outputs card on right */}
                <div className="rounded-2xl border border-slate-900 bg-[#161B26] p-5 shadow-lg flex flex-col justify-between">
                  <h3 className="text-xs font-semibold text-slate-350 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-450" /> Calculated Risk Allocations
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4 flex-1">
                    <div className="bg-slate-900/40 border border-slate-850/40 rounded-xl p-4.5 text-center flex flex-col justify-center">
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Recommended Position</span>
                      <div className="text-xl font-extrabold text-[#F5C542] mt-1.5 font-mono">{calculatedLotSize.toFixed(2)} Lots</div>
                      <span className="text-[9px] text-slate-500 mt-1 font-semibold">XAUUSD volume lots</span>
                    </div>

                    <div className="bg-slate-900/40 border border-slate-850/40 rounded-xl p-4.5 text-center flex flex-col justify-center">
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Dollar Risk (Per Trade)</span>
                      <div className="text-xl font-extrabold text-rose-400 mt-1.5 font-mono">${calculatedDollarRisk.toFixed(2)}</div>
                      <span className="text-[9px] text-slate-500 mt-1 font-semibold">Fixed risk profile</span>
                    </div>

                    <div className="col-span-2 bg-slate-900/40 border border-slate-850/40 rounded-xl p-4.5 text-center flex flex-col justify-center">
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Maximum Trades Allowed Today</span>
                      <div className="text-xl font-extrabold text-emerald-450 mt-1.5 font-mono">{maxTradesRemaining} Executions</div>
                      <span className="text-[9px] text-slate-500 mt-1 font-semibold">Before daily max drawdown limit block</span>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 7: ECONOMIC CALENDAR */}
          {activeTab === 'calendar' && (
            <div className="space-y-6 rounded-2xl border border-slate-900 bg-[#161B26] p-5 shadow-lg">
              <div>
                <h3 className="text-xs font-semibold text-slate-350 uppercase tracking-wider">US Economic Calendar Releases</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">High-impact macro event blackout gates checklist (+/- 30 mins)</p>
              </div>
              
              <div className="space-y-4">
                {[
                  { name: 'US Consumer Price Index (CPI)', impact: 'HIGH', time: 'Wednesday, July 22, 12:30 UTC', desc: 'Core inflation rate index updates. Significant Gold market driver.', color: 'border-l-4 border-rose-500 bg-rose-950/10' },
                  { name: 'Federal Open Market Committee (FOMC) Rate Decision', impact: 'HIGH', time: 'Wednesday, July 29, 18:00 UTC', desc: 'Fed interest rate targets & press release blackout.', color: 'border-l-4 border-rose-500 bg-rose-950/10' },
                  { name: 'US Non-Farm Payrolls (NFP) Employment Report', impact: 'HIGH', time: 'Friday, August 7, 13:30 UTC', desc: 'US employment data. Highest market volatility triggers.', color: 'border-l-4 border-rose-500 bg-rose-950/10' },
                  { name: 'US Retail Sales (MoM)', impact: 'MEDIUM', time: 'Thursday, July 16, 12:30 UTC', desc: 'Consumer retail sales indices.', color: 'border-l-4 border-amber-500 bg-amber-950/10' }
                ].map((item, idx) => (
                  <div key={idx} className={`p-4 rounded-xl border border-slate-900 flex justify-between items-center ${item.color}`}>
                    <div>
                      <div className="text-xs font-extrabold text-slate-200">{item.name}</div>
                      <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#F5C542]" /> {item.time}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">{item.desc}</p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded text-[9px] font-bold ${
                      item.impact === 'HIGH' ? 'bg-rose-950/40 text-rose-450 border border-rose-550/20' : 'bg-amber-950/40 text-amber-450 border border-amber-550/20'
                    }`}>
                      {item.impact} IMPACT
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 8: SETTINGS */}
          {activeTab === 'settings' && (
            <SettingsPanel 
              settings={settings}
              onSaveSettings={handleSaveSettings}
              onTestTelegram={handleTestTelegram}
              isLoading={isLoading}
            />
          )}

        </div>
      </div>

      {/* Floating Notifications Toasts */}
      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl border text-xs shadow-2xl z-50 flex items-center gap-2 animate-bounce ${
          toast.type === 'success' ? 'bg-emerald-950 text-emerald-300 border-emerald-500/20' :
          toast.type === 'error' ? 'bg-rose-950 text-rose-300 border-rose-500/20' :
          'bg-slate-900 text-slate-300 border-slate-750'
        }`}>
          <span>{toast.message}</span>
        </div>
      )}

    </div>
  );
}
