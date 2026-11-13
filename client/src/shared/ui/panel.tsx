import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

/** Flat bordered section; layout owns the outer hairlines. */
export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("flex min-h-0 min-w-0 flex-col bg-bg", className)} {...props} />;
}

interface PanelHeaderProps {
  /** section title */
  title?: ReactNode;
  /** left slot instead of a title, e.g. a TabBar */
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Panel top row: title or tabs on the left, actions on the right. */
export function PanelHeader({ title, children, actions, className }: PanelHeaderProps) {
  return (
    <div className={cn("flex min-h-12 shrink-0 items-center justify-between gap-4 border-b border-border px-4 sm:px-5", className)}>
      {title !== undefined && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
      {children}
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Inner card used inside panels and modals. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-border bg-surface-raised/40 p-4", className)} {...props} />;
}
