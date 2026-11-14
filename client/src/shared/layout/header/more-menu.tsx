"use client";

import { useRef } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { MORE_NAV } from "@/shared/config/navigation";
import { useDisclosure } from "@/shared/hooks/use-disclosure";
import { useDismiss } from "@/shared/hooks/use-dismiss";
import { cn } from "@/shared/lib/cn";

const ITEM = "flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm text-fg transition-colors hover:bg-surface-raised";

/** "More" dropdown after main nav links, ghost style. */
export function MoreMenu() {
  const menu = useDisclosure();
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(rootRef, menu.close, menu.isOpen);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={menu.toggle}
        aria-expanded={menu.isOpen}
        aria-haspopup="menu"
        className="focus-ring flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
      >
        More
        <ChevronDown className={cn("size-3.5 transition-transform", menu.isOpen && "rotate-180")} strokeWidth={1.75} />
      </button>

      <AnimatePresence>
        {menu.isOpen && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute top-full left-0 z-50 mt-2 w-48 origin-top-left rounded-xl border border-border bg-surface p-1.5 shadow-xl shadow-black/40"
          >
            {MORE_NAV.map((link) =>
              link.href === null ? (
                <span key={link.label} role="menuitem" aria-disabled className={cn(ITEM, "cursor-default flex-col items-start gap-0 hover:bg-transparent")}>
                  {link.label}
                  <span className="text-[10px] text-fg-muted">coming soon</span>
                </span>
              ) : link.external ? (
                <a key={link.label} role="menuitem" href={link.href} target="_blank" rel="noopener noreferrer" className={ITEM} onClick={menu.close}>
                  {link.label}
                  <ExternalLink className="size-3 text-fg-muted" strokeWidth={1.75} />
                </a>
              ) : (
                <Link key={link.label} role="menuitem" href={link.href} className={ITEM} onClick={menu.close}>
                  {link.label}
                </Link>
              ),
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
