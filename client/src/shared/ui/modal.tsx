"use client";

import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/shared/lib/cn";

const WIDTH = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-2xl" } as const;

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof WIDTH;
  /** false = children sit on the sheet, no inner card */
  card?: boolean;
}

const EASE = [0.22, 1, 0.36, 1] as const;

/** Centered sheet over a dimmed backdrop; Escape / backdrop closes. */
export function Modal({ open, title, onClose, children, size = "md", card = true }: ModalProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const onEscape = useEffectEvent((e: KeyboardEvent) => e.key === "Escape" && onClose());

  useEffect(() => {
    if (!open) return;
    const restore = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => onEscape(e);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      restore?.focus();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label={`Close ${title}`}
            tabIndex={-1}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-[2px]"
          />
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: EASE }}
            className={cn(
              "relative z-10 flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface text-fg shadow-2xl shadow-black/50 outline-none",
              WIDTH[size],
            )}
          >
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-4">
              <h2 className="text-base font-semibold text-fg">{title}</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="focus-ring flex size-8 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg"
              >
                <X className="size-4" strokeWidth={1.6} />
              </button>
            </header>
            <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto p-3">
              {card ? <div className="rounded-xl bg-surface-raised/50 p-4">{children}</div> : children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
