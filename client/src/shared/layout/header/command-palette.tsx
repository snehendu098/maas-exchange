"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, LayoutGrid, Search } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { SearchItem } from "@/shared/lib/search-items";
import { Kbd } from "@/shared/ui/kbd";
import { TokenLogo } from "@/shared/ui/token-logo";
import type { useCommandPalette } from "@/shared/hooks/use-command-palette";

const EASE = [0.22, 1, 0.36, 1] as const;

function ItemIcon({ item }: { item: SearchItem }) {
  if (item.asset) return <TokenLogo asset={item.asset} size={32} />;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-strong text-fg-muted">
      <LayoutGrid className="size-4" strokeWidth={1.6} />
    </span>
  );
}

/** Centered search sheet: input, Explore list, key hints. */
export function CommandPalette({ p }: { p: ReturnType<typeof useCommandPalette> }) {
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (p.open) input.current?.focus();
  }, [p.open]);

  // keep the highlighted row in view while arrowing
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${p.active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [p.active]);

  return (
    <AnimatePresence>
      {p.open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]">
          <motion.button
            type="button"
            aria-label="Close search"
            tabIndex={-1}
            onClick={p.close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="relative z-10 flex max-h-[70dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl shadow-black/50"
          >
            <label className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
              <Search className="size-5 shrink-0 text-fg-muted" strokeWidth={1.6} />
              <input
                ref={input}
                role="combobox"
                aria-expanded="true"
                aria-controls="command-results"
                aria-activedescendant={p.results[p.active] ? `cmd-${p.results[p.active].id}` : undefined}
                aria-label="Search markets and pages"
                autoComplete="off"
                spellCheck={false}
                value={p.query}
                onChange={(e) => p.setQuery(e.target.value)}
                onKeyDown={p.onKeyDown}
                placeholder="Search markets or pages..."
                className="h-full min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-muted"
              />
            </label>

            <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto p-2">
              <p className="flex items-center gap-2 px-3 pt-2 pb-2 text-xs text-fg-muted">
                <Search className="size-3.5" strokeWidth={1.6} />
                {p.query.trim() ? "Results" : "Explore"}
              </p>
              <ul ref={list} id="command-results" role="listbox" aria-label="Results">
                {p.results.map((item, i) => (
                  <li
                    key={item.id}
                    id={`cmd-${item.id}`}
                    data-index={i}
                    role="option"
                    aria-selected={i === p.active}
                    onMouseMove={() => p.setActive(i)}
                    onClick={() => p.select(item)}
                    className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors", i === p.active && "bg-surface-raised")}
                  >
                    <ItemIcon item={item} />
                    <span className="flex min-w-0 flex-col">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[15px] font-medium text-fg">{item.title}</span>
                        <span className="shrink-0 text-sm text-fg-muted">{item.tag}</span>
                      </span>
                      <span className="truncate text-xs text-fg-muted">{item.sub}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {p.results.length === 0 && <p className="px-3 py-10 text-center text-sm text-fg-muted">No matches.</p>}
            </div>

            <footer className="flex shrink-0 items-center justify-center gap-5 border-t border-border px-4 py-3 text-xs text-fg">
              <span className="flex items-center gap-1.5">
                <Kbd><ArrowUp className="size-3" strokeWidth={2} /></Kbd>
                <Kbd><ArrowDown className="size-3" strokeWidth={2} /></Kbd>
                List
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd className="w-auto px-2">Enter</Kbd>
                Select
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd className="w-auto px-2">Esc</Kbd>
                Close
              </span>
            </footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
