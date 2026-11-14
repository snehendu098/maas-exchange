import { Check } from "lucide-react";
import { cn } from "@/shared/lib/cn";

interface CheckboxProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

/** Native checkbox: hairline box, fills brand when checked. */
export function Checkbox({ label, checked, disabled, onChange, className }: CheckboxProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 text-[13px] text-fg-secondary select-none",
        disabled && "cursor-not-allowed opacity-40",
        className,
      )}
    >
      <span className="relative flex size-4 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer size-4 cursor-pointer appearance-none rounded-[5px] border border-border-strong bg-surface transition-colors checked:border-brand checked:bg-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed"
        />
        <Check
          aria-hidden
          strokeWidth={3}
          className="pointer-events-none absolute inset-0.5 size-3 text-brand-fg opacity-0 peer-checked:opacity-100"
        />
      </span>
      {label}
    </label>
  );
}
