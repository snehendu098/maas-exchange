"use client";

import { useEffect, useState } from "react";
import HeroChart from "./HeroChart";
import Roll from "./Roll";
import SplitText from "./SplitText";
import { ArrowUpRight, Chevron } from "./Icons";
import { heroSlides } from "@/lib/markets";
import { hms, useCountdown } from "@/lib/hooks";

export default function Hero() {
  const [idx, setIdx] = useState(0);
  const m = heroSlides[idx];
  const n = heroSlides.length;
  const left = useCountdown(m.endsIn, idx);
  const go = (d: number) => setIdx((i) => (i + d + n) % n);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + n) % n);
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n]);

  return (
    <section className="hero">
      <div className="frame">
        <div className="hero-stage">
          <HeroChart market={m} />

          <div className="hero-title panel rise" style={{ animationDelay: "0.05s" }}>
            <SplitText key={idx} as="h1" text={m.title} stagger={55} />
            <p className="deposits">
              {m.statLabel} <Roll className="mono num" text={m.statValue} />
            </p>
          </div>

          <div className="hero-timer panel rise" style={{ animationDelay: "0.2s" }}>
            <span className="timer-lbl">{m.timerLabel}</span>
            <Roll className="timer-num" text={hms(left)} />
          </div>

          <div className="hero-gauge panel rise" style={{ animationDelay: "0.35s" }}>
            <div className="gauge-top">
              <div>
                <Roll className="chance-num" text={m.gaugeValue} />
                <span className="chance-lbl">{m.gaugeLabel}</span>
              </div>
              <ArrowUpRight className="gauge-arrow" />
            </div>
            <svg className="gauge" viewBox="0 0 200 58" preserveAspectRatio="none" aria-hidden="true">
              <path d="M2 58 A122 122 0 0 1 198 58" className="track" />
              <path
                d="M2 58 A122 122 0 0 1 198 58"
                className="fill"
                pathLength={100}
                style={{ strokeDasharray: `${m.gaugePct} 100` }}
              />
            </svg>
          </div>
        </div>

        <div className="hero-controls rise" style={{ animationDelay: "0.5s" }}>
          <button className="btn-ghost sq" onClick={() => go(-1)} aria-label="Previous slide">
            <Chevron dir="left" className="ico" />
          </button>
          <span className="mono count">
            <Roll text={`${idx + 1}`} />/{n}
          </span>
          <button className="btn-ghost sq" onClick={() => go(1)} aria-label="Next slide">
            <Chevron dir="right" className="ico" />
          </button>
        </div>
      </div>
    </section>
  );
}
