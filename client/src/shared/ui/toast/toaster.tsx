"use client";

import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, X } from "lucide-react";
import { TOAST_TTL_MS, dismissToast, toastStore, type Toast } from "./toast-store";

const LINE = {
  hidden: { opacity: 0, y: 4 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
} as const;

export function Toaster() {
  const toasts = useSyncExternalStore(toastStore.subscribe, toastStore.get, toastStore.getServer);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-12 z-[110] flex w-[min(340px,calc(100vw-2rem))] flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  return (
    <motion.div
      layout
      role={toast.tone === "error" ? "alert" : "status"}
      initial={{ opacity: 0, x: 48, y: 8, scale: 0.94 }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 64, scale: 0.96, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
      transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.8 }}
      className="pointer-events-auto relative flex items-start gap-2.5 overflow-hidden rounded-xl border border-border bg-surface/90 px-3.5 py-3 shadow-2xl shadow-black/50 backdrop-blur-xl"
    >
      <motion.div
        className="min-w-0 flex-1"
        initial="hidden"
        animate="shown"
        variants={{ shown: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } } }}
      >
        <motion.p variants={LINE} className="text-[13px] leading-5 font-medium text-fg">
          {toast.title}
        </motion.p>
        {toast.description && (
          <motion.p variants={LINE} className="text-xs leading-4 break-words text-fg-muted">
            {toast.description}
          </motion.p>
        )}
        {toast.href && (
          <motion.a variants={LINE} href={toast.href} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-0.5 text-xs text-fg hover:underline">
            View on Basescan <ArrowUpRight className="size-3" />
          </motion.a>
        )}
      </motion.div>
      <motion.button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismissToast(toast.id)}
        whileHover={{ rotate: 90 }}
        whileTap={{ scale: 0.85 }}
        className="-mr-1 shrink-0 rounded-md p-0.5 text-fg-muted hover:text-fg"
      >
        <X className="size-3.5" strokeWidth={1.6} />
      </motion.button>
      <span
        aria-hidden
        style={{ animation: `toast-countdown ${TOAST_TTL_MS}ms linear forwards` }}
        className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-white/25"
      />
    </motion.div>
  );
}
