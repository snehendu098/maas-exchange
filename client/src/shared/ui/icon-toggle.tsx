"use client";

import { useId } from "react";
import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export interface IconToggleOption<T extends string> {
  value: T;
  label: string;
  Icon: LucideIcon;
}

interface IconToggleProps<T extends string> {
  options: ReadonlyArray<IconToggleOption<T>>;
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
}

const SLIDE = { type: "spring", stiffness: 380, damping: 32 } as const;

/** Icon pill group, sliding highlight. */
export function IconToggle<T extends string>({ options, value, onChange, "aria-label": label }: IconToggleProps<T>) {
  const highlightId = useId();
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {options.map(({ value: option, label: name, Icon }) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          aria-label={name}
          title={name}
          onClick={() => onChange(option)}
          className={cn(
            "relative flex h-8 items-center rounded-full px-2.5 transition-colors",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand",
            option === value ? "text-fg" : "text-fg-muted hover:text-fg",
          )}
        >
          {option === value && (
            <motion.span aria-hidden layoutId={`icon-toggle-${highlightId}`} transition={SLIDE} className="absolute inset-0 rounded-full bg-surface-raised" />
          )}
          <Icon className="relative size-4" />
        </button>
      ))}
    </div>
  );
}
