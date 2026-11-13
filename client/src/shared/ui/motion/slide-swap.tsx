"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/shared/lib/cn";

/** Vertical roll when `swapKey` changes: new in from below, old out the top. */
interface SlideSwapProps {
  swapKey: string;
  children: ReactNode;
  /** end = right-aligned figures, e.g. table cells */
  align?: "start" | "end";
  className?: string;
}

export function SlideSwap({ swapKey, children, align = "start", className }: SlideSwapProps) {
  return (
    <span className={cn("relative flex overflow-hidden", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={swapKey}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className={cn("flex min-w-0 flex-1 items-center gap-2", align === "end" && "justify-end")}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
