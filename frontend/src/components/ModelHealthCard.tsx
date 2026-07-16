import React, { useState } from 'react';
import { Cpu, AlertTriangle, RefreshCw, BarChart3, ShieldCheck } from 'lucide-react';

interface ModelHealthMeta {
  version: string;
  trained_at: string;
  data_start: string;
  data_end: string;
  accuracy: number;
  precision: number;
  recall: number;
  feature_importances: Record<string, number>;
}

interface ModelHealthCardProps {
  modelHealth: {
    active: boolean;
    metadata: ModelHealthMeta | null;
    live_accuracy: number;
    total_live_signals: number;
    drift_warning: boolean;
    candidates_count: number;
    min_required: number;
  } | null;
  onRetrainModel: () => Promise<void>;
  isLoading: boolean;
}

export const ModelHealthCard: React.FC<ModelHealthCardProps> = ({
  modelHealth,
  onRetrainModel,
  isLoading
}) => {
  const [retraining, setRetraining] = useState(false);

  const handleRetrain = async () => {
    setRetraining(true);
    await onRetrainModel();
    setRetraining(false);
  };

  if (!modelHealth) {
    return (
      <div className="rounded-2xl border border-slate-800 glass-panel p-5 shadow-lg animate-pulse h-[340px]" />
    );
  }

  const { active, metadata, live_accuracy, total_live_signals, drift_warning, candidates_count, min_required } = modelHealth;

  // Format feature importances sorted descending
  const sortedFeatures = metadata
    ? Object.entries(metadata.feature_importances)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    : [];

  const maxImportance = sortedFeatures.length > 0 ? sortedFeatures[0][1] : 1;

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 glass-panel p-5 shadow-lg flex flex-col justify-between h-[340px]">
      
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-blue-400" /> Layer 2 Machine Learning Status
          </h4>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Random Forest binary classifier version ledger
          </p>
        </div>
        
        {/* Drift alert indicator badge */}
        {active && (
          drift_warning ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold bg-rose-950/60 text-rose-400 border border-rose-500/20 animate-pulse">
              <AlertTriangle className="w-3 h-3" /> MODEL DRIFT DETECTED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3 h-3" /> MODEL HEALTHY
            </span>
          )
        )}
      </div>

      {active && metadata ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-2.5 flex-1 min-h-0">
          
          {/* Version and Split details */}
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Active Version</span>
              <div className="font-bold text-slate-200 font-mono">{metadata.version}</div>
            </div>
            <div>
              <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">Last Training Run</span>
              <div className="text-slate-350 text-[11px] font-medium">{formatDate(metadata.trained_at)}</div>
            </div>
            <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-slate-900">
              <div>
                <span className="text-[8px] text-slate-500 uppercase font-bold">Accuracy</span>
                <div className="font-bold text-slate-250">{(metadata.accuracy * 100).toFixed(0)}%</div>
              </div>
              <div className="border-x border-slate-900 px-1 text-center">
                <span className="text-[8px] text-slate-500 uppercase font-bold">Precision</span>
                <div className="font-bold text-slate-250">{(metadata.precision * 100).toFixed(0)}%</div>
              </div>
              <div className="pl-1 text-right">
                <span className="text-[8px] text-slate-500 uppercase font-bold">Live Acc</span>
                <div className="font-bold text-blue-400">{live_accuracy > 0 ? `${live_accuracy}% (${total_live_signals})` : '-'}</div>
              </div>
            </div>
          </div>

          {/* Feature Importances (SHAP/MDI scores) */}
          <div className="flex flex-col min-h-0">
            <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-1">
              <BarChart3 className="w-3 h-3 text-blue-450" /> Top Feature Importances (MDI)
            </span>
            <div className="space-y-1.5 overflow-y-auto flex-1 pr-0.5">
              {sortedFeatures.map(([name, weight]) => {
                const pct = (weight / maxImportance) * 100;
                // Prettify feature names
                const cleanName = name.replace(/_/g, ' ').replace('ema dist', 'EMA Distance').replace('atr relative', 'Relative ATR');
                return (
                  <div key={name}>
                    <div className="flex justify-between text-[9px] text-slate-400 font-medium mb-0.5">
                      <span className="truncate max-w-[110px] capitalize">{cleanName}</span>
                      <span className="font-mono text-slate-500">{weight.toFixed(3)}</span>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-1 overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-4 my-2">
          <AlertTriangle className="w-8 h-8 text-amber-500/80 mb-2 animate-pulse" />
          <span className="text-xs font-semibold text-slate-350">No Model Loaded</span>
          <p className="text-[10px] text-slate-500 max-w-[240px] mt-1">
            Model data ledger is empty ({candidates_count}/{min_required} candidates logged). Retrain model to bootstrap.
          </p>
        </div>
      )}

      {/* Footer controls */}
      <div className="border-t border-slate-900/60 pt-3 flex justify-between items-center bg-slate-950/10 -mx-5 -mb-5 px-5 py-3 rounded-b-2xl">
        <span className="text-[9px] text-slate-500 font-medium">
          Logged candidates dataset: <strong className="text-slate-300">{candidates_count} setups</strong>
        </span>
        <button
          onClick={handleRetrain}
          disabled={isLoading || retraining}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[10px] py-1.5 px-3 rounded-lg border border-slate-750 active:scale-95 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${retraining ? 'animate-spin' : ''}`} />
          {retraining ? 'Retraining...' : 'Force Model Retrain'}
        </button>
      </div>

    </div>
  );
};
export default ModelHealthCard;
