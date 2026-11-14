"use client";

import { useId, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { useDisclosure } from "@/shared/hooks/use-disclosure";
import { useDismiss } from "@/shared/hooks/use-dismiss";
import { cn } from "@/shared/lib/cn";
import { SelectPill } from "./select-pill";
import type { TabOption } from "./tab-bar";

export interface SelectTriggerProps {
  isOpen: boolean;
  toggle: () => void;
  menuId: string;
}

interface SelectMenuProps<T extends string> {
  options: ReadonlyArray<TabOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** a11y name of the default trigger */
  label: string;
  /** custom trigger; default is a SelectPill */
  renderTrigger?: (props: SelectTriggerProps) => ReactNode;
  size?: "sm" | "md";
  align?: "left" | "right";
  panelClassName?: string;
  className?: string;
}

/** Single-select dropdown with a check on the active option. */
export function SelectMenu<T extends string>({
  options,
  value,
  onChange,
  label,
  renderTrigger,
  size = "md",
  align = "left",
  panelClassName,
  className,
}: SelectMenuProps<T>) {
  const { isOpen, toggle, close } = useDisclosure();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useDismiss(rootRef, close, isOpen);
  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {renderTrigger ? (
        renderTrigger({ isOpen, toggle, menuId })
      ) : (
        <SelectPill
          size={size}
          value={selected?.label}
          open={isOpen}
          onClick={toggle}
          aria-controls={menuId}
          aria-label={label}
        />
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id={menuId}
            role="listbox"
            aria-label={label}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "absolute top-[calc(100%+6px)] z-50 min-w-40 origin-top overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-xl shadow-black/50",
              align === "left" ? "left-0" : "right-0",
              panelClassName,
            )}
          >
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value);
                    close();
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface-raised",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
                    "text-fg",
                  )}
                >
                  {option.label}
                  {active && <Check className="size-3.5 text-brand" strokeWidth={2} />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
