"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

/** Cross-fade when `swapKey` changes (tab bodies); keeps flex fill. */
export function FadeSwap({ swapKey, children, className = "flex min-h-0 flex-1 flex-col" }: { swapKey: string; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={swapKey}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
