import Link from "next/link";
import { getMarketById } from "@/shared/config/markets";
import { routes } from "@/shared/config/navigation";
import { cn } from "@/shared/lib/cn";
import { TokenLogo } from "@/shared/ui/token-logo";

export function MarketCell({ market, isBuy, sideTag }: { market: number; isBuy?: boolean; sideTag?: boolean }) {
  const m = getMarketById(market);
  if (!m) return <span>#{market}</span>;
  return (
    <span className="flex items-center gap-2">
      <Link href={routes.trade(m.symbol)} className="flex items-center gap-2.5 hover:underline">
        <TokenLogo asset={m} size={20} />
        <span className={cn(isBuy === undefined ? "text-fg" : isBuy ? "text-up" : "text-down")}>{m.symbol}-PERP</span>
      </Link>
      {sideTag && isBuy !== undefined && (
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] leading-none font-medium", isBuy ? "bg-up-soft text-up" : "bg-down-soft text-down")}>
          {isBuy ? "Long" : "Short"}
        </span>
      )}
    </span>
  );
}
