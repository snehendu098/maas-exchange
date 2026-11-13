import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

/** label left, figure right; lives inside a <dl> */
export function SummaryRow({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="min-w-0 truncate text-fg-muted">{label}</dt>
      <dd className={cn("shrink-0 font-medium text-fg tabular-nums", className)}>{children}</dd>
    </div>
  );
}

export const Dash = () => <span className="text-fg-muted">—</span>;
