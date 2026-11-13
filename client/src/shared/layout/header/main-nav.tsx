"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MAIN_NAV } from "@/shared/config/navigation";
import { cn } from "@/shared/lib/cn";
import { MoreMenu } from "./more-menu";

/** Primary nav; active link = white text, no bg. */
export function MainNav({ className, withMore = true }: { className?: string; withMore?: boolean }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className={cn("flex items-center gap-1", className)}>
      {MAIN_NAV.map((item) => {
        const active = pathname.startsWith(item.match);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-ring rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {item.label}
          </Link>
        );
      })}
      {withMore && <MoreMenu />}
    </nav>
  );
}
