"use client";

import { Search } from "lucide-react";
import { useCommandPalette } from "@/shared/hooks/use-command-palette";
import { cn } from "@/shared/lib/cn";
import { Kbd } from "@/shared/ui/kbd";
import { CommandPalette } from "./command-palette";

/** Navbar search pill; opens the ⌘K palette. */
export function GlobalSearch({ className }: { className?: string }) {
  const palette = useCommandPalette();
  return (
    <>
      <button
        type="button"
        onClick={palette.show}
        aria-haspopup="dialog"
        className={cn(
          "focus-ring flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm text-fg-muted transition-colors hover:border-border-strong",
          className,
        )}
      >
        <Search className="size-4 shrink-0" strokeWidth={1.6} />
        <span className="flex-1 text-left">Search markets</span>
        <span aria-hidden className="flex shrink-0 gap-1">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <CommandPalette p={palette} />
    </>
  );
}
