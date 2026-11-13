import type { ReactNode } from "react";

/** Grey filled status pill, Market close size; fixed width so stacked pills line up. */
export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 w-20 shrink-0 items-center justify-center rounded-full bg-surface-raised px-3 text-xs font-medium whitespace-nowrap text-fg">
      {children}
    </span>
  );
}
