import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/cn";

interface SelectPillProps extends Omit<ComponentProps<"button">, "value"> {
  /** muted prefix, e.g. "Group" */
  label?: string;
  value: ReactNode;
  icon?: ReactNode;
  open?: boolean;
  size?: "sm" | "md";
}

/** Pill select trigger; hang a menu off onClick. */
export function SelectPill({ label, value, icon, open, size = "md", className, type = "button", ...props }: SelectPillProps) {
  return (
    <button
      type={type}
      aria-haspopup="listbox"
      aria-expanded={open}
      className={cn(
        "focus-ring inline-flex items-center gap-2 rounded-full border font-medium whitespace-nowrap transition-colors",
        open ? "border-brand/50 bg-brand/10" : "border-border bg-surface hover:bg-surface-raised",
        size === "md" ? "h-10 px-4 text-sm" : "h-8 px-3 text-[13px]",
        className,
      )}
      {...props}
    >
      {icon && <span className="shrink-0 text-fg-muted">{icon}</span>}
      {label && <span className="text-fg-muted">{label}</span>}
      <span className="text-fg">{value}</span>
      <ChevronDown className={cn("size-4 text-fg-muted transition-transform", open && "rotate-180")} strokeWidth={1.5} />
    </button>
  );
}
