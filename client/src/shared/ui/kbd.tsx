import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

/** Keycap chip for shortcut hints. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md bg-surface-raised font-sans text-xs leading-none text-fg-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
