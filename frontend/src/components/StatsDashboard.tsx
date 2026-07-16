import React from 'react';
import type { Stats, BacktestResult } from '../types';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { ShieldAlert, TrendingUp, AlertOctagon, BarChart3, ChevronUp } from 'lucide-react';

interface StatsDashboardProps {
  stats: Stats | null;
  dailyLossPercent: number;
  maxDailyLossLimit: number;
  maxDrawdownLimit: number;
  backtestResult: BacktestResult | null;
  onRunBacktest: () => void;
  isBacktesting: boolean;
}

export const StatsDashboard: React.FC<StatsDashboardProps> = ({
  stats,
  dailyLossPercent,
  maxDailyLossLimit,
  maxDrawdownLimit,
  backtestResult,
  onRunBacktest,
  isBacktesting
}) => {
  const winRate = stats?.win_rate || 0;
  const netR = stats?.net_r || 0;
  
  const winRateColor = winRate >= 50 ? 'text-emerald-400' : 'text-amber-500';
  const netRColor = netR >= 0 ? 'text-emerald-400' : 'text-rose-500';

  const dailyLossClean = Math.max(0, dailyLossPercent);
  const dailyProgress = Math.min(100, (dailyLossClean / maxDailyLossLimit) * 100);
  const dailyDrawdownStatusColor = dailyProgress >= 80 ? 'bg-rose-500' : dailyProgress >= 50 ? 'bg-amber-500' : 'bg-emerald-500';

  // 1. Merge A/B Equity Curves for Dual Plotting
  const rulesCurve = backtestResult?.rules_only?.equity_curve || [];
  const mlCurve = backtestResult?.rules_ml?.equity_curve || [];
  
  const mergedMap: Record<string, { time: string; rules_only?: number; rules_ml?: number }> = {};
  
  rulesCurve.forEach(p => {
    mergedMap[p.time] = { time: p.time, rules_only: p.balance };
  });
  
  mlCurve.forEach(p => {
    if (mergedMap[p.time]) {
      mergedMap[p.time].rules_ml = p.balance;
    } else {
      mergedMap[p.time] = { time: p.time, rules_ml: p.balance };
    }
  });
  
  const chartData = Object.values(mergedMap).sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Metrics Panel */}
      <div className="lg:col-span-1 flex flex-col gap-4">
        
        {/* Drawdown & Safety Checks */}
        <div className="rounded-2xl border border-slate-800 glass-panel p-5 shadow-lg flex-1">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
            <AlertOctagon className="w-4 h-4 text-rose-450" /> Prop Firm Risk Rails
          </h4>
          
          <div className="space-y-5">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-slate-350">Daily Max Loss ({maxDailyLossLimit}%)</span>
                <span className={dailyLossClean >= maxDailyLossLimit ? 'text-rose-450 font-bold' : 'text-slate-450'}>
                  {dailyLossClean.toFixed(2)}% / {maxDailyLossLimit}%
                </span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800/40">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${dailyDrawdownStatusColor}`}
                  style={{ width: `${dailyProgress}%` }}
                />
              </div>
              {dailyLossClean >= maxDailyLossLimit && (
                <p className="text-[9px] text-rose-450 font-semibold mt-1.5 animate-pulse">
                  🚨 Safety limit hit. Signals disabled.
                </p>
              )}
            </div>
            
            <div>
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-slate-350">Max Drawdown ({maxDrawdownLimit}%)</span>
                <span className="text-slate-450">0.00% / {maxDrawdownLimit}%</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800/40">
                <div 
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                  style={{ width: '0%' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Live Performance Panel */}
        <div className="rounded-2xl border border-slate-800 glass-panel p-5 shadow-lg flex-1">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-emerald-400" /> Live Account Stats
          </h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900/40 border border-slate-800/20 rounded-xl p-3 text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Live Win Rate</div>
              <div className={`text-xl font-bold ${winRateColor}`}>{winRate.toFixed(1)}%</div>
              <div className="text-[9px] text-slate-500 mt-0.5">{stats?.wins || 0}W - {stats?.losses || 0}L</div>
            </div>
            
            <div className="bg-slate-900/40 border border-slate-800/20 rounded-xl p-3 text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Live Net R</div>
              <div className={`text-xl font-bold ${netRColor}`}>{netR >= 0 ? '+' : ''}{netR.toFixed(1)}R</div>
              <div className="text-[9px] text-slate-500 mt-0.5">Avg win: {(stats?.avg_win_r || 0).toFixed(1)}R</div>
            </div>
          </div>
        </div>

      </div>

      {/* Backtester A/B Engine */}
      <div className="lg:col-span-2 rounded-2xl border border-slate-800 glass-panel p-5 shadow-lg flex flex-col justify-between">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-blue-400" /> Walk-Forward A/B Backtest
            </h4>
            <p className="text-[10px] text-slate-500 mt-0.5">Comparing Rules-Only Baseline vs. Rules+ML Classifier</p>
          </div>
          <button
            onClick={onRunBacktest}
            disabled={isBacktesting}
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs py-2 px-3 rounded-lg active:scale-95 transition-all disabled:opacity-50"
          >
            {isBacktesting ? 'Running Backtest...' : 'Run Comparative Backtest'}
          </button>
        </div>

        {chartData.length > 0 ? (
          <div className="flex-1 min-h-[170px] mt-2 relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRulesOnly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0}/>
                  </linearGradient>
                  <linearGradient id="colorRulesML" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="time" 
                  tickFormatter={(val) => val.split(' ')[0]} 
                  stroke="#475569" 
                  fontSize={8} 
                />
                <YAxis 
                  stroke="#475569" 
                  fontSize={8} 
                  domain={['auto', 'auto']}
                  tickFormatter={(val) => `$${val}`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '10px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} />
                <Area type="monotone" dataKey="rules_only" stroke="#3b82f6" strokeWidth={1.5} fillOpacity={1} fill="url(#colorRulesOnly)" name="Rules-Only Baseline" />
                <Area type="monotone" dataKey="rules_ml" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRulesML)" name="Rules + ML Combined" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl my-2 text-slate-500 text-xs text-center p-4">
            <ShieldAlert className="w-8 h-8 text-slate-650 mb-2" />
            No backtest data loaded. Trigger the comparative test run to view ML lift metrics.
          </div>
        )}

        {backtestResult && (
          <div className="border-t border-slate-850/60 pt-3 mt-3 overflow-x-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="text-slate-550 border-b border-slate-900 uppercase font-semibold">
                  <th className="pb-1.5">Strategy Mode</th>
                  <th className="pb-1.5 text-center">Total Trades</th>
                  <th className="pb-1.5 text-center">Win Rate</th>
                  <th className="pb-1.5 text-center">Max Drawdown</th>
                  <th className="pb-1.5 text-center">Net R-Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/40 text-slate-300 font-medium">
                <tr className="hover:bg-slate-900/10">
                  <td className="py-1.5 text-blue-400 font-semibold">Rules-Only Baseline</td>
                  <td className="py-1.5 text-center">{backtestResult.rules_only.total_trades}</td>
                  <td className="py-1.5 text-center">{backtestResult.rules_only.win_rate}%</td>
                  <td className="py-1.5 text-center text-rose-500/80">{backtestResult.rules_only.max_drawdown}%</td>
                  <td className="py-1.5 text-center font-bold text-slate-200">{backtestResult.rules_only.net_r}R</td>
                </tr>
                <tr className="hover:bg-slate-900/10">
                  <td className="py-1.5 text-emerald-450 font-semibold flex items-center gap-1">
                    Rules + ML Combined
                    {backtestResult.rules_ml.win_rate > backtestResult.rules_only.win_rate && (
                      <span className="text-[8px] bg-emerald-950/80 border border-emerald-500/20 text-emerald-400 px-1 rounded flex items-center gap-0.5">
                        <ChevronUp className="w-2.5 h-2.5" /> +{(backtestResult.rules_ml.win_rate - backtestResult.rules_only.win_rate).toFixed(0)}% Lift
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-center">{backtestResult.rules_ml.total_trades}</td>
                  <td className="py-1.5 text-center text-emerald-400">{backtestResult.rules_ml.win_rate}%</td>
                  <td className="py-1.5 text-center text-emerald-500/85">{backtestResult.rules_ml.max_drawdown}%</td>
                  <td className="py-1.5 text-center font-extrabold text-emerald-400">+{backtestResult.rules_ml.net_r}R</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
};
export default StatsDashboard;
