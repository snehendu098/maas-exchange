import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

const VARIANTS = {
  /** lime brand action, dark label */
  primary: "bg-brand text-brand-fg enabled:hover:brightness-95",
  /** long / confirm */
  up: "bg-up text-brand-fg enabled:hover:brightness-110",
  /** short / destructive */
  down: "bg-down text-brand-fg enabled:hover:brightness-110",
  secondary: "bg-surface-raised text-fg enabled:hover:bg-surface-strong",
  outline: "border border-border bg-surface text-fg enabled:hover:bg-surface-raised",
  ghost: "text-fg-muted enabled:hover:bg-surface-raised enabled:hover:text-fg",
  link: "text-brand underline underline-offset-4 enabled:hover:opacity-80",
} as const;

const SIZES = {
  sm: "h-8 rounded-lg px-3 text-[13px]",
  md: "h-10 rounded-xl px-4 text-sm",
  lg: "h-14 rounded-2xl px-6 text-lg",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: keyof typeof SIZES;
}

export function Button({ variant = "primary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "focus-ring inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap",
        "transition-[filter,color,background-color,border-color,transform] enabled:active:scale-[0.98]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        SIZES[size],
        VARIANTS[variant],
        variant === "link" && "h-auto px-0",
        className,
      )}
      {...props}
    />
  );
}

/** Ticket CTA: label + handler, rendered as a full-width Button. */
export interface ConfirmAction {
  label: ReactNode;
  disabled?: boolean;
  onConfirm: () => void;
  variant?: ButtonVariant;
}
