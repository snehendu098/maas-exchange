import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return <table className={cn("w-full border-collapse text-[13px]", className)} {...props} />;
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "label-mono sticky top-0 z-[1] h-9 bg-surface px-3 text-left whitespace-nowrap text-fg-muted first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return (
    <td
      className={cn("h-11 px-3 whitespace-nowrap text-fg tabular-nums first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5", className)}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-t border-border transition-colors hover:bg-surface-raised/40", className)} {...props} />;
}
