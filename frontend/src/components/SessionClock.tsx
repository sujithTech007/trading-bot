import React, { useEffect, useState } from 'react';
import { Clock, Globe } from 'lucide-react';
import type { Settings } from '../types';

interface SessionClockProps {
  settings: Settings | null;
}

export const SessionClock: React.FC<SessionClockProps> = ({ settings }) => {
  const [utcTime, setUtcTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setUtcTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTimeString = (date: Date) => {
    const h = String(date.getUTCHours()).padStart(2, '0');
    const m = String(date.getUTCMinutes()).padStart(2, '0');
    const s = String(date.getUTCSeconds()).padStart(2, '0');
    return `${h}:${m}:${s} UTC`;
  };

  const getSessionStatus = () => {
    const hour = utcTime.getUTCHours();
    const min = utcTime.getUTCMinutes();
    const timeVal = hour + min / 60;

    // Default times (in hours)
    const asianStart = 0;
    const asianEnd = 8;
    const londonStart = 8;
    const londonEnd = 13;
    const nyStart = 13;
    const nyEnd = 21;

    let activeSession = 'ROLLOVER / LOW LIQUIDITY';
    let sessionColor = 'text-slate-500 bg-slate-950/40 border-slate-900';
    let glowClass = '';
    let countdownLabel = 'Next NY Session starts in';
    let countdownHours = 0;

    if (timeVal >= asianStart && timeVal < asianEnd) {
      activeSession = 'ASIAN SESSION ACTIVE';
      sessionColor = 'text-emerald-400 bg-emerald-950/30 border-emerald-500/20';
      glowClass = 'glow-emerald';
      countdownLabel = 'Asian Session ends in';
      countdownHours = asianEnd - timeVal;
    } else if (timeVal >= londonStart && timeVal < londonEnd) {
      const isAllowed = settings?.allow_london || false;
      activeSession = `LONDON SESSION ACTIVE${isAllowed ? '' : ' (SUPPRESSED)'}`;
      sessionColor = isAllowed 
        ? 'text-amber-400 bg-amber-950/30 border-amber-500/20' 
        : 'text-rose-400 bg-rose-950/30 border-rose-500/20';
      glowClass = isAllowed ? 'glow-amber' : 'glow-rose';
      countdownLabel = 'London Session ends in';
      countdownHours = londonEnd - timeVal;
    } else if (timeVal >= nyStart && timeVal < nyEnd) {
      activeSession = 'NEW YORK SESSION ACTIVE';
      sessionColor = 'text-blue-400 bg-blue-950/30 border-blue-500/20';
      glowClass = 'glow-blue';
      countdownLabel = 'New York Session ends in';
      countdownHours = nyEnd - timeVal;
    } else {
      // Rollover
      countdownLabel = 'Asian Session starts in';
      countdownHours = 24 - timeVal;
    }

    const cHours = Math.floor(countdownHours);
    const cMins = Math.floor((countdownHours - cHours) * 60);
    const cSecs = Math.floor((((countdownHours - cHours) * 60) - cMins) * 60);
    
    const countdownStr = `${String(cHours).padStart(2, '0')}h ${String(cMins).padStart(2, '0')}m ${String(cSecs).padStart(2, '0')}s`;

    return { activeSession, sessionColor, glowClass, countdownLabel, countdownStr };
  };

  const { activeSession, sessionColor, glowClass, countdownLabel, countdownStr } = getSessionStatus();

  return (
    <div className="rounded-2xl border border-slate-800 glass-panel p-5 shadow-lg flex items-center justify-between">
      <div className="flex items-center gap-4">
        {/* World Icon Globe Spinner */}
        <div className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-blue-400">
          <Globe className="w-6 h-6 animate-spin" style={{ animationDuration: '40s' }} />
        </div>
        
        <div>
          <div className="text-xl font-bold tracking-tight text-white font-mono flex items-center gap-2">
            <Clock className="w-4.5 h-4.5 text-slate-400" />
            {formatTimeString(utcTime)}
          </div>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Server Clock Time</span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <span className={`text-[10px] font-bold tracking-widest px-3 py-1 rounded-full border uppercase ${sessionColor} ${glowClass}`}>
          {activeSession}
        </span>
        <span className="text-[11px] text-slate-400">
          {countdownLabel}: <strong className="text-slate-200 font-mono">{countdownStr}</strong>
        </span>
      </div>
    </div>
  );
};
export default SessionClock;
