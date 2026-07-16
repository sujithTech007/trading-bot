import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    TradingView: any;
  }
}

export const TradingViewChart: React.FC = () => {
  const containerId = "tradingview_xauusd_widget";
  const scriptLoaded = useRef(false);

  useEffect(() => {
    // Check if script is already present
    const existingScript = document.getElementById('tradingview-widget-script');
    
    const initWidget = () => {
      if (window.TradingView) {
        new window.TradingView.widget({
          width: "100%",
          height: 480,
          symbol: "OANDA:XAUUSD",
          interval: "15",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#0f172a",
          enable_publishing: false,
          hide_side_toolbar: false,
          allow_symbol_change: true,
          container_id: containerId,
          gridColor: "rgba(30, 41, 59, 0.5)",
          studies: [
            "EMA@tv-basicstudies",
            "RSI@tv-basicstudies"
          ],
        });
      }
    };

    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'tradingview-widget-script';
      script.src = 'https://s3.tradingview.com/tv.js';
      script.type = 'text/javascript';
      script.async = true;
      script.onload = () => {
        scriptLoaded.current = true;
        initWidget();
      };
      document.head.appendChild(script);
    } else {
      // Script is already loaded, initialize directly
      initWidget();
    }
  }, []);

  return (
    <div className="w-full rounded-2xl overflow-hidden border border-slate-800 glass-panel shadow-2xl relative">
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-none">
        <span className="flex h-2.5 w-2.5 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
        </span>
        <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase bg-slate-900/80 px-2 py-0.5 rounded-md border border-emerald-500/20">
          Live Chart feed
        </span>
      </div>
      <div id={containerId} className="w-full bg-[#0b0f19]" style={{ height: "480px" }} />
    </div>
  );
};
export default TradingViewChart;
