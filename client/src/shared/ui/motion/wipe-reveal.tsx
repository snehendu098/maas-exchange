"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/shared/lib/cn";

interface WipeRevealProps {
  /** change to replay, e.g. view + range */
  revealKey: string;
  children: ReactNode;
  className?: string;
}

/** Left-to-right clip wipe + fade, replays when `revealKey` changes; charts draw in. */
export function WipeReveal({ revealKey, children, className }: WipeRevealProps) {
  return (
    <motion.div
      key={revealKey}
      initial={{ opacity: 0, clipPath: "inset(0 100% 0 0)" }}
      animate={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={cn("absolute inset-0", className)}
    >
      {children}
    </motion.div>
  );
}
