"use client";

import { useEffect, useRef, useState } from "react";

/** Counts down from `seconds`, restarting when `key` changes. Loops at 0 (demo data). */
export function useCountdown(seconds: number, key: unknown = seconds) {
  const [state, setState] = useState({ key, left: seconds });
  // Reset during render when key changes (React-recommended over setState-in-effect).
  if (state.key !== key) setState({ key, left: seconds });

  useEffect(() => {
    const id = setInterval(() => {
      setState((s) => ({ ...s, left: s.left > 0 ? s.left - 1 : seconds }));
    }, 1000);
    return () => clearInterval(id);
  }, [seconds, key]);

  return state.key === key ? state.left : seconds;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const hms = (s: number) =>
  `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
export const ms = (s: number) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

/** True once the element has scrolled into view. */
export function useInView<T extends Element>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

/** Animates 0→target over `duration` ms once `active` flips true. */
export function useCountUp(target: number, active: boolean, duration = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);
  return v;
}

export type LivePrices = Partial<Record<"BTC" | "ETH" | "NEAR", { price: number; publishTime: number }>>;

/** Polls /api/prices (server-cached Pyth) every `everyMs`; {} until first response or on failure. */
export function useLivePrices(everyMs = 15_000) {
  const [prices, setPrices] = useState<LivePrices>({});
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/prices")
        .then((r) => (r.ok ? r.json() : {}))
        .then((p: LivePrices) => alive && setPrices(p))
        .catch(() => {});
    load();
    const id = setInterval(load, everyMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [everyMs]);
  return prices;
}
