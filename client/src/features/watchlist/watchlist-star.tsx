"use client";

import { Star } from "lucide-react";
import { useWatchlist } from "@/features/watchlist/watchlist-provider";
import { cn } from "@/shared/lib/cn";

export function WatchlistStar({ symbol, size = 15, className }: { symbol: string; size?: number; className?: string }) {
  const { isWatched, toggle } = useWatchlist();
  const watched = isWatched(symbol);

  return (
    <button
      type="button"
      onClick={(e) => {
        // host rows are clickable
        e.stopPropagation();
        toggle(symbol);
      }}
      aria-pressed={watched}
      aria-label={watched ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
      className={cn(
        "flex shrink-0 items-center justify-center transition-colors",
        watched ? "text-warn" : "text-fg-muted hover:text-fg",
        className,
      )}
    >
      <Star
        style={{ width: size, height: size }}
        strokeWidth={1.4}
        fill={watched ? "currentColor" : "none"}
      />
    </button>
  );
}
