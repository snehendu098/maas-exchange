import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

/** Centered muted message. */
export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center px-6 text-center text-[15px] text-fg-muted", className)}>
      {children}
    </div>
  );
}
