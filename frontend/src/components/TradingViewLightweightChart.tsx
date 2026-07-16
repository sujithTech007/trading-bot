"use client";

import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, ISeriesApi } from 'lightweight-charts';
import { RefreshCw, BarChart2 } from 'lucide-react';

interface TradingViewLightweightChartProps {
  activeSignal: {
    entry_price: number;
    stop_loss: number;
    take_profit: number;
    direction: 'BUY' | 'SELL';
  } | null;
  livePrice: number | null;
}

export const TradingViewLightweightChart: React.FC<TradingViewLightweightChartProps> = ({
  activeSignal,
  livePrice
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [timeframe, setTimeframe] = useState<string>("15min");
  const [loading, setLoading] = useState<boolean>(false);

  // Price Lines Refs
  const entryLineRef = useRef<any>(null);
  const slLineRef = useRef<any>(null);
  const tpLineRef = useRef<any>(null);

  // 1. Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0b0f19' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.5)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.5)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 295,
      timeScale: {
        timeVisible: true,
        borderColor: '#1e293b',
      },
      rightPriceScale: {
        borderColor: '#1e293b',
      }
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candlestickSeries;

    window.addEventListener('resize', handleResize);

    // Fetch initial data
    loadCandleData(timeframe);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // 2. Fetch candle data when timeframe changes
  const loadCandleData = async (tf: string) => {
    if (!candleSeriesRef.current) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/candles?interval=${tf}&limit=120`);
      if (res.ok) {
        const data = await res.json();
        // Convert to lightweight chart items sorted by time asc
        const formatted = data.map((d: any) => ({
          time: d.time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        })).sort((a: any, b: any) => a.time - b.time);

        candleSeriesRef.current.setData(formatted);
        chartRef.current.timeScale().fitContent();
      }
    } catch (e) {
      console.error("Error loading lightweight charts candles:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandleData(timeframe);
  }, [timeframe]);

  // 3. Update Price Levels (Entry, SL, TP) when activeSignal changes
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    // Clear old lines
    if (entryLineRef.current) {
      try { series.removePriceLine(entryLineRef.current); } catch {}
      entryLineRef.current = null;
    }
    if (slLineRef.current) {
      try { series.removePriceLine(slLineRef.current); } catch {}
      slLineRef.current = null;
    }
    if (tpLineRef.current) {
      try { series.removePriceLine(tpLineRef.current); } catch {}
      tpLineRef.current = null;
    }

    if (activeSignal) {
      // Entry Line
      entryLineRef.current = series.createPriceLine({
        price: activeSignal.entry_price,
        color: '#3b82f6',
        lineWidth: 2,
        lineStyle: 0, // Solid
        axisLabelVisible: true,
        title: 'ENTRY LEVEL',
      });

      // SL Line
      slLineRef.current = series.createPriceLine({
        price: activeSignal.stop_loss,
        color: '#ef4444',
        lineWidth: 2,
        lineStyle: 1, // Dotted
        axisLabelVisible: true,
        title: 'STOP LOSS (SL)',
      });

      // TP Line
      tpLineRef.current = series.createPriceLine({
        price: activeSignal.take_profit,
        color: '#10b981',
        lineWidth: 2,
        lineStyle: 1, // Dotted
        axisLabelVisible: true,
        title: 'TARGET (TP)',
      });
    }
  }, [activeSignal]);

  // 4. Update the latest tick if livePrice changes
  useEffect(() => {
    if (!candleSeriesRef.current || !livePrice) return;
    try {
      // Get the time for the latest tick (approximation using local unix time)
      const nowUnix = Math.floor(Date.now() / 1000);
      
      // Lightweight charts update requires time to match or exceed previous series timestamp.
      // We push a mock tick update or just update close on livePrice.
    } catch {}
  }, [livePrice]);

  return (
    <div className="rounded-2xl border border-slate-800 glass-panel p-5 shadow-lg flex flex-col h-full justify-between">
      
      {/* Header and Controls */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-emerald-450" />
          <h4 className="text-xs font-semibold text-slate-350 uppercase tracking-wider">
            XAUUSD Live Advanced Charting
          </h4>
        </div>
        
        {/* Timeframe Selector Toggles */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-850">
          {["5min", "15min", "1h", "4h"].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`text-[9px] uppercase font-bold py-1 px-2.5 rounded-lg transition-all ${
                timeframe === tf
                  ? "bg-slate-900 text-white shadow-sm border border-slate-800/40"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {tf.replace("min", "m")}
            </button>
          ))}
          <button 
            onClick={() => loadCandleData(timeframe)}
            disabled={loading}
            className="p-1 hover:text-slate-350 text-slate-550 border-l border-slate-900 pl-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Chart Canvas Reference */}
      <div className="w-full relative flex-1 min-h-[295px] bg-[#0b0f19] rounded-xl overflow-hidden border border-slate-900/60">
        <div ref={chartContainerRef} className="w-full h-full" />
      </div>

      {/* Footer Info */}
      <div className="flex justify-between items-center text-[9px] text-slate-500 font-semibold mt-3">
        <span>XAUUSD (GOLD / USD) • SPOT • TWELVEDATA DATA ENGINE</span>
        {activeSignal && (
          <span className="text-blue-400 uppercase">
            Active Setup: {activeSignal.direction} @ ${activeSignal.entry_price}
          </span>
        )}
      </div>

    </div>
  );
};
export default TradingViewLightweightChart;
