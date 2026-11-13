import type { ComponentProps, ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/shared/lib/cn";

interface SearchInputProps extends Omit<ComponentProps<"input">, "onChange" | "value"> {
  value: string;
  onValueChange: (value: string) => void;
  /** trailing slot, e.g. a shortcut hint */
  end?: ReactNode;
}

/** Pill search field. */
export function SearchInput({ value, onValueChange, placeholder = "Search", end, className, ...props }: SearchInputProps) {
  return (
    <label className={cn("flex h-10 w-full items-center gap-2 rounded-full border border-border bg-surface px-4 transition-colors focus-within:border-border-strong", className)}>
      <Search className="size-4 shrink-0 text-fg-muted" strokeWidth={1.6} />
      <input
        type="search"
        autoComplete="off"
        aria-label={placeholder}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onValueChange(e.target.value)}
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {end}
    </label>
  );
}
