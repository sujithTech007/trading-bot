import React from 'react';
import type { Signal, Settings } from '../types';
import { Shield, Target, Award, Play, CheckCircle2, Clock } from 'lucide-react';


interface ActiveSignalCardProps {
  signal: Signal | null;
  settings: Settings | null;
  onTriggerMock: () => void;
  isLoading: boolean;
}

export const ActiveSignalCard: React.FC<ActiveSignalCardProps> = ({
  signal,
  settings,
  onTriggerMock,
  isLoading
}) => {
  if (!signal) {
    return (
      <div className="rounded-2xl border border-slate-800 glass-panel p-6 flex flex-col items-center justify-center text-center h-[340px] shadow-lg">
        <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center text-slate-400 mb-4 border border-slate-700/50 animate-pulse-slow">
          <Clock className="w-6 h-6" />
        </div>
        <h3 className="font-semibold text-slate-300 text-lg mb-1">No Active Trade Setup</h3>
        <p className="text-slate-500 text-sm max-w-[260px] mb-6">
          The strategy engine is waiting for high-probability parameters to align in the active session.
        </p>
        <button
          onClick={onTriggerMock}
          disabled={isLoading}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs py-2.5 px-4 rounded-xl border border-emerald-500/20 transition-all active:scale-95 disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          Test Trigger Mock Signal
        </button>
      </div>
    );
  }

  const isBuy = signal.direction === 'BUY';
  const confidenceColor = signal.confidence_score >= 80 ? 'text-emerald-400 border-emerald-500/30' : 'text-amber-400 border-amber-500/30';

  return (
    <div className={`rounded-2xl border ${isBuy ? 'border-emerald-800/40 glow-emerald' : 'border-rose-800/40 glow-rose'} glass-panel p-6 flex flex-col justify-between h-full shadow-lg transition-all`}>
      {/* Card Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-bold tracking-wider px-2 py-0.5 rounded-md border uppercase ${
              isBuy ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30' : 'bg-rose-950/60 text-rose-400 border-rose-500/30'
            }`}>
              {signal.direction}
            </span>
            <span className="text-slate-400 text-xs font-medium">{signal.session} SESSION</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">{signal.pair}</h2>
        </div>
        <div className={`border rounded-xl px-2.5 py-1 text-center bg-slate-900/60`}>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Confidence</div>
          <div className={`text-base font-bold ${confidenceColor}`}>{signal.confidence_score}%</div>
        </div>
      </div>

      {/* Targets and Stats Grid */}
      <div className="grid grid-cols-3 gap-3 my-3 bg-slate-900/40 border border-slate-800/30 rounded-xl p-3">
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">Entry Price</span>
          <span className="text-base font-bold text-slate-200">${signal.entry_price.toFixed(2)}</span>
        </div>
        <div className="flex flex-col border-x border-slate-800/50 px-3">
          <span className="text-[10px] text-rose-450 font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
            <Shield className="w-2.5 h-2.5" /> Stop Loss
          </span>
          <span className="text-base font-bold text-rose-400">${signal.stop_loss.toFixed(2)}</span>
        </div>
        <div className="flex flex-col pl-2">
          <span className="text-[10px] text-emerald-450 font-semibold uppercase tracking-wider mb-1 flex items-center gap-1">
            <Target className="w-2.5 h-2.5" /> Target TP
          </span>
          <span className="text-base font-bold text-emerald-400">${signal.take_profit.toFixed(2)}</span>
        </div>
      </div>

      {/* ML Confidence Score */}
      {signal.ml_confidence_score !== undefined && signal.ml_confidence_score !== null && (
        <div className="bg-slate-900/60 border border-slate-850/40 rounded-xl p-3 mb-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">ML Win Probability</div>
            <div className="text-[9px] text-slate-400 font-medium">Model: <span className="font-mono text-slate-350">{signal.ml_version}</span></div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-extrabold text-blue-405">{Math.round(signal.ml_confidence_score * 100)}%</span>
            <div className="w-12 bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-850">
              <div 
                className={`h-full rounded-full ${
                  signal.ml_confidence_score >= 0.70 ? 'bg-emerald-500' : 'bg-blue-500'
                }`}
                style={{ width: `${signal.ml_confidence_score * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Lot size & Risk metrics */}
      <div className="flex items-center justify-between text-xs text-slate-400 mb-3 bg-slate-900/20 px-3 py-2 rounded-lg border border-slate-800/20">
        <div className="flex items-center gap-1.5">
          <Award className="w-4 h-4 text-emerald-400" />
          <span>Lot Size: <strong className="text-slate-200">{signal.lot_size.toFixed(2)} Lots</strong></span>
        </div>
        <div>
          <span>Risk: <strong className="text-slate-200">1:{signal.risk_reward} R:R ({settings?.risk_percent || 1}%)</strong></span>
        </div>
      </div>

      {/* Confluences Checklist */}
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Confluence Checklist</div>
        <div className="space-y-1">
          {signal.confluence_reasons.map((reason, idx) => (
            <div key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <span className="leading-tight">{reason}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
export default ActiveSignalCard;
