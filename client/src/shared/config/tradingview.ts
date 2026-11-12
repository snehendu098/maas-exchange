import type { MarketSymbol } from "./markets";

export const TRADINGVIEW_WIDGET_SRC = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

// pyth feeds match our oracle
export const TRADINGVIEW_SYMBOLS: Record<MarketSymbol, string> = {
  BTC: "PYTH:BTCUSD",
  ETH: "PYTH:ETHUSD",
  NEAR: "PYTH:NEARUSD",
};

export type TradingViewInterval = "1" | "5" | "15" | "60" | "240" | "D" | "W";

export const DEFAULT_CHART_INTERVAL: TradingViewInterval = "15";
