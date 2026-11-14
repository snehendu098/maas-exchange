"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/shared/lib/cn";

const OFFSET = 48;
const VARIANTS = {
  enter: (dir: number) => ({ x: dir * OFFSET, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: -dir * OFFSET, opacity: 0 }),
};

interface PagerSlideProps {
  /** tab position; higher slides in from the right */
  index: number;
  children: ReactNode;
  className?: string;
}

/** Horizontal slide between tab bodies, direction follows index. */
export function PagerSlide({ index, children, className }: PagerSlideProps) {
  const [prev, setPrev] = useState(index);
  const [dir, setDir] = useState(1);
  if (index !== prev) {
    setDir(index > prev ? 1 : -1);
    setPrev(index);
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.div
          key={index}
          custom={dir}
          variants={VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
