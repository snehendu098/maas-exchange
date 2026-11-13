"use client";

import { useEffect, useRef } from "react";
import { DEFAULT_CHART_INTERVAL, TRADINGVIEW_WIDGET_SRC, type TradingViewInterval } from "@/shared/config/tradingview";
import { cn } from "@/shared/lib/cn";

interface TradingViewChartProps {
  /** exchange-prefixed, e.g. PYTH:BTCUSD */
  symbol: string;
  interval?: TradingViewInterval;
  /** defaults read from --pv-bg / --pv-grid */
  backgroundColor?: string;
  gridColor?: string;
  className?: string;
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** TradingView advanced-chart embed. Rebuilt per symbol/interval, cleared on unmount. */
export function TradingViewChart({ symbol, interval = DEFAULT_CHART_INTERVAL, backgroundColor, gridColor, className }: TradingViewChartProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget h-full w-full";
    const script = document.createElement("script");
    script.src = TRADINGVIEW_WIDGET_SRC;
    script.type = "text/javascript";
    script.async = true;
    script.text = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: backgroundColor ?? cssVar("--pv-bg"),
      gridColor: gridColor ?? cssVar("--pv-grid"),
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      support_host: "https://www.tradingview.com",
    });

    // deferred so a strict-mode mount/unmount never fires a script
    const timer = window.setTimeout(() => host.replaceChildren(widget, script));
    return () => {
      window.clearTimeout(timer);
      host.replaceChildren();
    };
  }, [symbol, interval, backgroundColor, gridColor]);

  return (
    <div
      ref={hostRef}
      aria-label={`${symbol} price chart`}
      role="figure"
      className={cn("tradingview-widget-container h-full w-full", className)}
    />
  );
}
