"use client";

import { motion } from "motion/react";

/** Remounts per top-level route: soft fade so page switches don't snap. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-1 flex-col md:min-h-0"
    >
      {children}
    </motion.div>
  );
}
