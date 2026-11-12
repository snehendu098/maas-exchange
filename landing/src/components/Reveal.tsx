"use client";

import type { ReactNode } from "react";
import { useInView } from "@/lib/hooks";

type Props = {
  children: ReactNode;
  delay?: number;
  variant?: "up" | "wipe";
  className?: string;
};

/** Blur-fade-lift (or clip wipe) children in when scrolled into view. */
export default function Reveal({ children, delay = 0, variant = "up", className = "" }: Props) {
  const [ref, inView] = useInView<HTMLDivElement>(0.15);
  return (
    <div
      ref={ref}
      className={`reveal reveal-${variant} ${inView ? "in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
