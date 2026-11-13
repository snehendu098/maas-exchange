"use client";

import { useNowSeconds } from "@/shared/hooks/use-now";
import { formatCountdown } from "../../lib/market-format";

export function FundingCountdown({ nextFundingTime }: { nextFundingTime: number }) {
  const now = useNowSeconds();
  return (
    <span className="font-mono tabular-nums" suppressHydrationWarning>
      {now === 0 ? "--:--:--" : formatCountdown(nextFundingTime - now)}
    </span>
  );
}
