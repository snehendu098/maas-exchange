"use client";

import { useEffect, useRef } from "react";
import { hash2, noise2 } from "@/lib/rand";

const REF_W = 1010;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function paint(cv: HTMLCanvasElement, mono: string) {
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = w * dpr;
  cv.height = h * dpr;
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const u = w / REF_W;

  // ---- soft gradient field
  ctx.fillStyle = "#f3b57e";
  ctx.fillRect(0, 0, w, h);
  const blob = (x: number, y: number, r: number, c: string) => {
    const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
    g.addColorStop(0, c);
    g.addColorStop(1, c.replace(/[\d.]+\)$/, "0)"));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  blob(1, 0.55, 0.45, "rgba(246,214,190,0.9)");
  blob(0.55, 0.22, 0.42, "rgba(232,110,30,0.95)");
  blob(0.4, 0.6, 0.3, "rgba(240,150,70,0.6)");
  blob(-0.02, 0.72, 0.26, "rgba(230,168,226,1)");
  blob(0.58, 1.05, 0.24, "rgba(232,165,225,1)");
  blob(0.92, 0.98, 0.18, "rgba(232,200,230,0.8)");

  // ---- starburst of "0" glyphs
  const cx = 0.53 * w;
  const cy = 0.26 * h;
  const gx = 11 * u;
  const gy = 13 * u;
  ctx.font = `${12 * u}px ${mono}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,236,214,0.42)";
  for (let j = 0; j * gy < h; j++) {
    for (let i = 0; i * gx < w; i++) {
      const x = i * gx + gx / 2;
      const y = j * gy + gy / 2;
      const dx = (x - cx) / w;
      const dy = (y - cy) / w;
      const r = Math.hypot(dx, dy);
      const th = Math.atan2(dy, dx) + (noise2(r * 6, 0, 3) - 0.5) * 0.9;
      const ray = Math.pow(Math.abs(Math.cos(th * 5.5)), 9);
      const fall = smooth(0.04, 0.12, r) * (1 - smooth(0.5, 0.72, r));
      const prob = ray * fall * 1.1 + Math.max(0, noise2(x / (40 * u), y / (40 * u), 7) - 0.7) * 0.8 * fall;
      if (hash2(i, j, 11) < prob) ctx.fillText("0", x, y);
    }
  }
}

export default function CtaArt() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const mono =
      getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono") || "monospace";
    const ro = new ResizeObserver(() => paint(cv, mono));
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);
  return <canvas ref={ref} className="cta-canvas" aria-hidden="true" />;
}
