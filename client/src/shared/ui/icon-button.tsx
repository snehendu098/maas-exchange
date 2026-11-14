import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";

export interface IconButtonProps extends ComponentProps<"button"> {
  /** a11y name, required */
  label: string;
  active?: boolean;
}

export function IconButton({ label, active, className, type = "button", children, ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "focus-ring inline-flex size-8 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors",
        "hover:bg-surface-raised hover:text-fg disabled:pointer-events-none disabled:opacity-40",
        active && "bg-surface-raised text-fg",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
