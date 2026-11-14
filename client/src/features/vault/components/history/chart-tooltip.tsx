import type { TooltipContentProps } from "recharts";
import { getMarket } from "@/shared/config/markets";
import { TokenLogo } from "@/shared/ui/token-logo";
import { formatUtcStamp } from "../../lib/vault-format";

type ChartTooltipProps = TooltipContentProps & { format: (value: number) => string };

export function ChartTooltip({ active, payload, label, format }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-bg px-3 py-2 text-xs shadow-xl">
      {typeof label === "number" && <p className="mb-1 font-medium text-fg">{formatUtcStamp(label)}</p>}
      {payload.map((entry) => {
        const market = getMarket(String(entry.name));
        return (
          <div key={String(entry.dataKey)} className="flex items-center gap-2">
            {/* market series show their token logo; others keep the color dot */}
            {market ? <TokenLogo asset={market} size={14} /> : <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />}
            <span className="text-fg-muted">{entry.name}:</span>
            <span className="font-mono font-medium text-fg">{typeof entry.value === "number" ? format(entry.value) : "—"}</span>
          </div>
        );
      })}
    </div>
  );
}
