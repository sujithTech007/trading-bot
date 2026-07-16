import React, { useState } from 'react';
import type { Settings } from '../types';
import { Save, Send, ShieldAlert, Cpu, Percent, Settings2 } from 'lucide-react';

interface SettingsPanelProps {
  settings: Settings | null;
  onSaveSettings: (settings: Settings) => void;
  onTestTelegram: (token: string, chatId: string) => Promise<boolean>;
  isLoading: boolean;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onSaveSettings,
  onTestTelegram,
  isLoading
}) => {
  const [formData, setFormData] = useState<Settings>({
    twelvedata_api_key: settings?.twelvedata_api_key || '',
    telegram_bot_token: settings?.telegram_bot_token || '',
    telegram_chat_id: settings?.telegram_chat_id || '',
    asian_start: settings?.asian_start || '00:00',
    asian_end: settings?.asian_end || '08:00',
    ny_start: settings?.ny_start || '13:00',
    ny_end: settings?.ny_end || '21:00',
    allow_london: settings?.allow_london || false,
    allow_rollover: settings?.allow_rollover || false,
    trend_timeframe: settings?.trend_timeframe || '4h',
    trend_ema_fast: settings?.trend_ema_fast || 50,
    trend_ema_slow: settings?.trend_ema_slow || 200,
    entry_timeframe: settings?.entry_timeframe || '15min',
    entry_ema_fast: settings?.entry_ema_fast || 9,
    entry_ema_slow: settings?.entry_ema_slow || 21,
    rsi_period: settings?.rsi_period || 14,
    rsi_overbought: settings?.rsi_overbought || 70,
    rsi_oversold: settings?.rsi_oversold || 30,
    atr_period: settings?.atr_period || 14,
    atr_multiplier: settings?.atr_multiplier || 2.0,
    atr_threshold: settings?.atr_threshold || 1.5,
    ml_confidence_cutoff: settings?.ml_confidence_cutoff || 0.65,
    account_balance: settings?.account_balance || 100000,
    risk_percent: settings?.risk_percent || 1.0,
    max_daily_loss_percent: settings?.max_daily_loss_percent || 5.0,
    max_weekly_loss_percent: settings?.max_weekly_loss_percent || 10.0,
  });

  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' 
        ? checked 
        : type === 'number' 
          ? parseFloat(value) 
          : value
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
  };

  const handleTelegramTest = async () => {
    setTestingTelegram(true);
    setTestResult(null);
    const success = await onTestTelegram(formData.telegram_bot_token, formData.telegram_chat_id);
    setTestResult(success);
    setTestingTelegram(false);
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      
      {/* Configuration Header */}
      <div className="flex justify-between items-center border-b border-slate-800/80 pb-4">
        <div>
          <h3 className="font-semibold text-slate-200 flex items-center gap-1.5">
            <Settings2 className="w-5 h-5 text-blue-400" /> Strategy Desk Parameters
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Parameters are written live to the database configuration system</p>
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs py-2 px-4 rounded-xl border border-blue-500/20 transition-all active:scale-95 disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" /> Save Configuration
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Credentials & Integrations */}
        <div className="rounded-2xl border border-slate-800 glass-panel p-5 shadow-lg space-y-4">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-blue-400" /> API Credentials & Webhooks
          </h4>
          
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">TwelveData API Key</label>
              <input
                type="password"
                name="twelvedata_api_key"
                value={formData.twelvedata_api_key}
                onChange={handleInputChange}
                placeholder="TwelveData API Key (Empty for Mock Feed)"
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Telegram Bot Token</label>
              <input
                type="password"
                name="telegram_bot_token"
                value={formData.telegram_bot_token}
                onChange={handleInputChange}
                placeholder="Telegram API Token"
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            
            <div className="grid grid-cols-3 gap-2 items-end">
              <div className="col-span-2">
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Telegram Chat ID</label>
                <input
                  type="text"
                  name="telegram_chat_id"
                  value={formData.telegram_chat_id}
                  onChange={handleInputChange}
                  placeholder="Chat ID"
                  className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <button
                type="button"
                onClick={handleTelegramTest}
                disabled={testingTelegram || !formData.telegram_bot_token || !formData.telegram_chat_id}
                className="w-full flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-[10px] h-9 rounded-xl border border-slate-750 transition-all active:scale-95 disabled:opacity-50"
              >
                <Send className="w-3 h-3" /> {testingTelegram ? 'Testing...' : 'Test Bot'}
              </button>
            </div>
            
            {testResult !== null && (
              <p className={`text-[10px] font-semibold ${testResult ? 'text-emerald-400' : 'text-rose-400'}`}>
                {testResult ? '✓ Telegram test message sent successfully!' : '✗ Failed to send. Check token and Chat ID.'}
              </p>
            )}
          </div>
        </div>

        {/* Risk & Safety Circuits */}
        <div className="rounded-2xl border border-slate-800 glass-panel p-5 shadow-lg space-y-4">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-rose-400" /> Account & Prop-Firm settings
          </h4>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Account Size ($)</label>
              <input
                type="number"
                name="account_balance"
                value={formData.account_balance}
                onChange={handleInputChange}
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Risk per trade (%)</label>
              <input
                type="number"
                step="0.1"
                name="risk_percent"
                value={formData.risk_percent}
                onChange={handleInputChange}
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Max Daily Loss (%)</label>
              <input
                type="number"
                step="0.1"
                name="max_daily_loss_percent"
                value={formData.max_daily_loss_percent}
                onChange={handleInputChange}
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Max Drawdown (%)</label>
              <input
                type="number"
                step="0.1"
                name="max_weekly_loss_percent"
                value={formData.max_weekly_loss_percent}
                onChange={handleInputChange}
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Session Times */}
        <div className="rounded-2xl border border-slate-800 glass-panel p-5 shadow-lg space-y-4">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            🔌 Sessions Hours (UTC)
          </h4>
          
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Asian Session Start</label>
                <input
                  type="text"
                  name="asian_start"
                  value={formData.asian_start}
                  onChange={handleInputChange}
                  placeholder="00:00"
                  className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Asian Session End</label>
                <input
                  type="text"
                  name="asian_end"
                  value={formData.asian_end}
                  onChange={handleInputChange}
                  placeholder="08:00"
                  className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">NY Session Start</label>
                <input
                  type="text"
                  name="ny_start"
                  value={formData.ny_start}
                  onChange={handleInputChange}
                  placeholder="13:00"
                  className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">NY Session End</label>
                <input
                  type="text"
                  name="ny_end"
                  value={formData.ny_end}
                  onChange={handleInputChange}
                  placeholder="21:00"
                  className="w-full bg-slate-900 border border-slate-850 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-6 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-350 cursor-pointer select-none">
                <input
                  type="checkbox"
                  name="allow_london"
                  checked={formData.allow_london}
                  onChange={handleInputChange}
                  className="rounded bg-slate-900 border-slate-800 text-blue-500 focus:ring-0 focus:ring-offset-0"
                />
                Allow London Session signals
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-350 cursor-pointer select-none">
                <input
                  type="checkbox"
                  name="allow_rollover"
                  checked={formData.allow_rollover}
                  onChange={handleInputChange}
                  className="rounded bg-slate-900 border-slate-800 text-blue-500 focus:ring-0 focus:ring-offset-0"
                />
                Allow Rollover signals
              </label>
            </div>
          </div>
        </div>

        {/* Indicator Calculations */}
        <div className="rounded-2xl border border-slate-800 glass-panel p-5 shadow-lg space-y-4">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Percent className="w-4 h-4 text-emerald-400" /> Strategy Mathematics
          </h4>
          
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1">HTF EMA Fast</label>
              <input
                type="number"
                name="trend_ema_fast"
                value={formData.trend_ema_fast}
                onChange={handleInputChange}
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1">HTF EMA Slow</label>
              <input
                type="number"
                name="trend_ema_slow"
                value={formData.trend_ema_slow}
                onChange={handleInputChange}
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Entry EMA Fast</label>
              <input
                type="number"
                name="entry_ema_fast"
                value={formData.entry_ema_fast}
                onChange={handleInputChange}
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Entry EMA Slow</label>
              <input
                type="number"
                name="entry_ema_slow"
                value={formData.entry_ema_slow}
                onChange={handleInputChange}
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1">RSI Period</label>
              <input
                type="number"
                name="rsi_period"
                value={formData.rsi_period}
                onChange={handleInputChange}
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1">ATR Period</label>
              <input
                type="number"
                name="atr_period"
                value={formData.atr_period}
                onChange={handleInputChange}
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1">RSI OB Limit</label>
              <input
                type="number"
                name="rsi_overbought"
                value={formData.rsi_overbought}
                onChange={handleInputChange}
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1">ATR Multiplier</label>
              <input
                type="number"
                step="0.1"
                name="atr_multiplier"
                value={formData.atr_multiplier}
                onChange={handleInputChange}
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1">ATR Min Thresh ($)</label>
              <input
                type="number"
                step="0.1"
                name="atr_threshold"
                value={formData.atr_threshold}
                onChange={handleInputChange}
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[9px] text-slate-500 uppercase tracking-wider font-semibold mb-1">ML Cutoff (0-1)</label>
              <input
                type="number"
                step="0.05"
                name="ml_confidence_cutoff"
                value={formData.ml_confidence_cutoff}
                onChange={handleInputChange}
                className="w-full bg-slate-900 border border-slate-850 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
        </div>

      </div>
    </form>
  );
};
export default SettingsPanel;
