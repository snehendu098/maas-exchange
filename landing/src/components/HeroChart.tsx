"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, sampleCurve, type HeroSlide } from "@/lib/markets";
import { hash2, noise2 } from "@/lib/rand";

const GREEN = "#72c07d";
const GREEN_HI = "#9be3a5";
const DOT = "rgba(255,255,255,0.32)";
const GLYPHS = "+?@%$:";
/** Design reference width of the hero frame (in screenshot px). */
const REF_W = 1728;

type Col = { p: number; h: number };
type Layout = { u: number; pitch: number; cols: Col[]; w: number; h: number };

function buildLayout(m: HeroSlide, w: number, h: number): Layout {
  const u = w / REF_W;
  const n = Math.max(8, Math.floor(w / (13.6 * u)));
  const pitch = w / n; // exact fit → symmetric edges
  const cols: Col[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const amp = 4.5 - 3 * t;
    const jitter = (hash2(i, 0, m.seed) - 0.5) * 2 * amp + (noise2(i * 0.18, 0, m.seed) - 0.5) * 3;
    const p = Math.max(2, Math.min(98, sampleCurve(m.curve, t) + jitter));
    const hh = Math.max(0.05, Math.min(0.9, (p / 100) * 1.07 - 0.14)) * h;
    cols.push({ p, h: hh });
  }
  return { u, pitch, cols, w, h };
}

const ease = (x: number) => 1 - Math.pow(1 - x, 3);

function draw(ctx: CanvasRenderingContext2D, L: Layout, seed: number, prog: number, mono: string) {
  const { u, pitch, cols, w, h } = L;
  const n = cols.length;
  ctx.clearRect(0, 0, w, h);
  const grow = (i: number) => ease(Math.min(1, Math.max(0, prog * 1.6 - (i / n) * 0.6)));

  // ---- ascii dust above the bars
  const gp = 16 * u;
  ctx.font = `${11 * u}px ${mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let gx = 0; gx * gp < w; gx++) {
    const x = gx * gp + gp / 2;
    const ci = Math.min(n - 1, Math.floor(x / pitch));
    const top = h - cols[ci].h * grow(ci);
    for (let gy = 0; gy * gp < h; gy++) {
      const y = gy * gp + gp / 2;
      const d = (top - y) / h;
      if (d < 0.012) continue;
      const cluster = Math.max(0, noise2(x / (110 * u), y / (110 * u), seed) - 0.5) * 1.6;
      const density = 0.95 * Math.exp(-d / 0.11) + cluster;
      if (hash2(gx, gy, seed) > density * Math.min(1, prog * 1.4)) continue;
      const c = hash2(gx, gy, seed + 1);
      ctx.fillStyle = DOT;
      if (c < 0.86) ctx.fillRect(x - u, y - u, 2.2 * u, 2.2 * u);
      else ctx.fillText(GLYPHS[Math.floor(hash2(gy, gx, seed + 2) * GLYPHS.length)], x, y);
    }
  }

  // ---- uniform pixel bars: equal widths, equal gaps, blocks on a shared row grid
  const gapX = 3.4 * u;
  const bw = pitch - gapX;
  const block = 22 * u;
  const gapY = 3 * u;
  const step = block + gapY;
  for (let i = 0; i < n; i++) {
    const rows = Math.round((cols[i].h * grow(i)) / step);
    if (rows < 1) continue;
    const x0 = i * pitch + gapX / 2;
    for (let k = 0; k < rows; k++) {
      // top block brighter for a crisp leading edge
      ctx.fillStyle = k === rows - 1 ? GREEN_HI : GREEN;
      ctx.fillRect(x0, h - (k + 1) * step + gapY, bw, block);
    }
  }
}

type Tip = { left: number; bottom: number; pct: number; date: string };

function pickTips(L: Layout, m: HeroSlide): Tip[] {
  const n = L.cols.length;
  if (n < 20) return [];
  const range = (a: number, b: number) => Array.from({ length: b - a }, (_, k) => a + k);
  const by = (ids: number[], cmp: (a: number, b: number) => boolean) =>
    ids.reduce((best, i) => (cmp(L.cols[i].p, L.cols[best].p) ? i : best), ids[0]);
  const hi = by(range(Math.floor(n * 0.3), Math.floor(n * 0.55)), (a, b) => a > b);
  const lo = by(range(hi + 3, Math.floor(n * 0.72)), (a, b) => a < b);
  const late = Math.floor(n * 0.84);
  const perDay = n / 16;
  return [hi, lo, late].map((i) => ({
    left: i * L.pitch,
    bottom: L.cols[i].h + 40 * L.u,
    pct: Math.round(L.cols[i].p),
    date: addDays(m.start, Math.floor(i / perDay)),
  }));
}

export default function HeroChart({ market }: { market: HeroSlide }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(
    () => (size.w ? buildLayout(market, size.w, size.h) : null),
    [market, size],
  );
  const tips = useMemo(() => (layout ? pickTips(layout, market) : []), [layout, market]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !layout) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = layout.w * dpr;
    cv.height = layout.h * dpr;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mono =
      getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono") || "monospace";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = reduce ? 1 : Math.min(1, (now - t0) / 900);
      draw(ctx, layout, market.seed, p, mono);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [layout, market.seed]);

  return (
    <div ref={wrap} className="chart">
      <canvas ref={canvas} />
      {tips.map((t, i) => (
        <div
          key={`${market.seed}-${i}`}
          className="chart-tip"
          style={{ left: t.left, bottom: t.bottom, animationDelay: `${0.7 + i * 0.12}s` }}
        >
          <span className="mono">{t.date}</span>
          <b>{t.pct}%</b>
        </div>
      ))}
    </div>
  );
}
