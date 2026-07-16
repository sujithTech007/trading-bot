import React from 'react';
import type { Signal } from '../types';
import { TrendingUp, TrendingDown, Clock, CheckCircle2, XCircle } from 'lucide-react';

interface SignalHistoryTableProps {
  signals: Signal[];
}

export const SignalHistoryTable: React.FC<SignalHistoryTableProps> = ({ signals }) => {
  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoStr;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'WIN':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> WIN
          </span>
        );
      case 'LOSS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/60 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> LOSS
          </span>
        );
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950/60 text-blue-400 border border-blue-500/20 animate-pulse">
            <Clock className="w-3 h-3" /> ACTIVE
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/60 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" /> PENDING
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-900 text-slate-400 border border-slate-800">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 glass-panel shadow-lg overflow-hidden flex flex-col h-[340px]">
      <div className="px-6 py-4 border-b border-slate-800/60 flex justify-between items-center bg-slate-900/25">
        <h3 className="font-semibold text-slate-200">Signal Execution Log</h3>
        <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{signals.length} Signals Logged</span>
      </div>
      
      <div className="flex-1 overflow-auto">
        {signals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm">
            No signal history available yet.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase font-bold tracking-wider bg-slate-950/45">
                <th className="px-6 py-3">Time</th>
                <th className="px-4 py-3">Pair</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Entry</th>
                <th className="px-4 py-3">SL / TP</th>
                <th className="px-4 py-3">Lots</th>
                <th className="px-4 py-3">Exit Price</th>
                <th className="px-4 py-3">Result</th>
                <th className="px-6 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-xs">
              {signals.map((s, idx) => {
                const isBuy = s.direction === 'BUY';
                
                // Calculate PnL locally if it exists
                let pnlText = '-';
                let pnlColor = 'text-slate-400';
                
                if (s.status === 'WIN') {
                  const pnlVal = (s.exit_price! - s.entry_price) * s.lot_size * 100;
                  const finalPnl = s.direction === 'BUY' ? pnlVal : -pnlVal;
                  pnlText = `+$${Math.abs(finalPnl).toFixed(2)} (+${s.r_multiple}R)`;
                  pnlColor = 'text-emerald-400 font-bold';
                } else if (s.status === 'LOSS') {
                  const pnlVal = (s.entry_price - s.stop_loss) * s.lot_size * 100;
                  pnlText = `-$${pnlVal.toFixed(2)} (-1R)`;
                  pnlColor = 'text-rose-400 font-semibold';
                }
                
                return (
                  <tr key={s.id || idx} className="hover:bg-slate-900/30 transition-colors">
                    <td className="px-6 py-3.5 text-slate-400 font-medium whitespace-nowrap">{formatDate(s.timestamp)}</td>
                    <td className="px-4 py-3.5 text-slate-200 font-bold">{s.pair}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1 font-bold ${isBuy ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isBuy ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        {s.direction}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-300">${s.entry_price.toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-slate-400 whitespace-nowrap">
                      <span className="text-rose-500/80 font-medium">${s.stop_loss.toFixed(2)}</span>
                      <span className="mx-1 text-slate-600">/</span>
                      <span className="text-emerald-500/80 font-medium">${s.take_profit.toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-300">{s.lot_size.toFixed(2)}</td>
                    <td className="px-4 py-3.5 font-medium text-slate-300">{s.exit_price ? `$${s.exit_price.toFixed(2)}` : '-'}</td>
                    <td className={`px-4 py-3.5 font-mono whitespace-nowrap ${pnlColor}`}>{pnlText}</td>
                    <td className="px-6 py-3.5 text-right whitespace-nowrap">{getStatusBadge(s.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
export default SignalHistoryTable;
