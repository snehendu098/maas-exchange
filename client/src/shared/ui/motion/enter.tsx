"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;
const TAGS = { div: motion.div, aside: motion.aside, section: motion.section } as const;

interface EnterProps {
  as?: keyof typeof TAGS;
  /** s; stagger sibling blocks with 0.06 steps */
  delay?: number;
  className?: string;
  children?: ReactNode;
  "aria-label"?: string;
}

/** Mount fade + 8px rise; transform clears when done so fixed popups inside stay put. */
export function Enter({ as = "div", delay = 0, className, children, ...aria }: EnterProps) {
  const Tag = TAGS[as];
  return (
    <Tag
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: EASE }}
      className={className}
      {...aria}
    >
      {children}
    </Tag>
  );
}
