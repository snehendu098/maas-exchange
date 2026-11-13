"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, createChart, HistogramSeries, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { MarketConfig } from "@/shared/config/markets";
import { PRICE_DECIMALS, priceToNumber, sizeToNumber } from "@/shared/lib/units";
import type { Candle } from "../../api/types";
import { priceDecimals } from "../../lib/market-format";

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** lightweight-charts candles + volume; rebuilt per market, data swapped in place. */
export default function CandleChart({ market, candles }: { market: MarketConfig; candles: Candle[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const series = useRef<{ price: ISeriesApi<"Candlestick">; volume: ISeriesApi<"Histogram">; up: string; down: string } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const [up, down, border, grid] = [cssVar("--pv-up"), cssVar("--pv-down"), cssVar("--pv-border"), cssVar("--pv-grid")];
    const chart = createChart(host, {
      autoSize: true, // ResizeObserver inside
      layout: { background: { color: cssVar("--pv-bg") }, textColor: cssVar("--pv-fg-muted"), attributionLogo: false },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: true },
    });
    const price = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderVisible: false,
      wickUpColor: up,
      wickDownColor: down,
      priceFormat: { type: "price", precision: priceDecimals(market), minMove: Number(market.tickSize) / 10 ** PRICE_DECIMALS },
    });
    const volume = chart.addSeries(HistogramSeries, { priceScaleId: "", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    series.current = { price, volume, up, down };
    return () => {
      series.current = null;
      chart.remove();
    };
  }, [market]);

  useEffect(() => {
    const s = series.current;
    if (!s) return;
    // ponytail: full setData per trade, fine at <=300 bars; switch to series.update() if it janks
    s.price.setData(
      candles.map((c) => ({ time: c.time as UTCTimestamp, open: priceToNumber(c.open), high: priceToNumber(c.high), low: priceToNumber(c.low), close: priceToNumber(c.close) })),
    );
    s.volume.setData(
      candles.map((c) => ({ time: c.time as UTCTimestamp, value: sizeToNumber(c.volume), color: `${BigInt(c.close) >= BigInt(c.open) ? s.up : s.down}55` })),
    );
  }, [candles, market]);

  return <div ref={hostRef} role="figure" aria-label={`${market.symbol} price chart`} className="h-full w-full" />;
}
