"use client";

import { useMemo } from "react";
import type { MarketCard } from "@/lib/markets";
import { ms, useCountdown, useCountUp, useInView, useLivePrices } from "@/lib/hooks";
import { rng } from "@/lib/rand";
import Roll from "./Roll";

const DUST = "··········+?:";

function Badge({ badge }: { badge: MarketCard["badge"] }) {
  const left = useCountdown(badge.kind === "countdown" ? badge.seconds : 0);
  return (
    <span className="tag-time mono">
      <i className="live-dot" />
      {badge.kind === "countdown" ? <Roll text={ms(left)} /> : badge.text}
    </span>
  );
}

const usd = (v: number) =>
  "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MoveCard({ market: m, delay = 0 }: { market: MarketCard; delay?: number }) {
  const [ref, inView] = useInView<HTMLElement>(0.3);
  const live = useLivePrices()[m.quote.symbol];
  const mid = live?.price ?? m.quote.fallback;
  const at = (bps: number) => usd(mid * (1 + bps / 1e4));
  const right = 100 - m.left;
  const leftV = useCountUp(m.left, inView, 1200 + delay);
  const rightV = useCountUp(right, inView, 1200 + delay);
  const dust = useMemo(() => {
    const r = rng(m.seed);
    return Array.from({ length: 46 }, () => (r() < 0.22 ? " " : DUST[Math.floor(r() * DUST.length)])).join("");
  }, [m.seed]);

  return (
    <article
      ref={ref}
      className={`card reveal ${inView ? "in" : ""}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="card-head">
        <span className="tag-hot">{m.tag}</span>
        <Badge badge={m.badge} />
      </div>
      <h3 className="card-q">{m.title}</h3>
      <div className="card-stats">
        <div className="odds">
          <div>
            <span className="mono lbl">{m.leftLabel}</span>
            <p className="pct yes">
              {Math.round(leftV)}%<small>+{m.delta}%</small>
            </p>
          </div>
          <div className="right">
            <span className="mono lbl">{m.rightLabel}</span>
            <p className="pct no">{Math.round(rightV)}%</p>
          </div>
        </div>
        <div className="meter">
          <span className="mono dust" aria-hidden="true">
            {dust}
          </span>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: `${leftV}%` }} />
            <div className="meter-no" />
          </div>
        </div>
        <div className="players mono">
          <span>{m.leftCount}</span>
          <span>{m.rightCount}</span>
        </div>
      </div>
      <div className="card-actions">
        <button className="bet yes">
          {m.leftCta} <Roll className="mono" text={at(m.quote.leftBps)} />
        </button>
        <button className="bet no">
          {m.rightCta} <Roll className="mono" text={at(m.quote.rightBps)} />
        </button>
      </div>
    </article>
  );
}
