"use client";

import { formatUsdcRaw } from "@/shared/lib/units";
import { EmptyState } from "@/shared/ui/empty-state";
import { StatBox, StatStrip } from "@/shared/ui/stat-box";
import { Table, Td, Th, Tr } from "@/shared/ui/table";
import { useVaultPosition, useVaultState } from "../../hooks/use-vault";
import { useVaultFunding } from "../../hooks/use-vault-history";
import { hourlyFunding } from "../../lib/earnings";
import { toAssets } from "../../lib/share-math";
import { formatShares, formatUtcStamp } from "../../lib/vault-format";

const DASH = "—";
const signed = (v: bigint) => `${v < 0n ? "-" : "+"}$${formatUsdcRaw(v < 0n ? -v : v, 4)}`;
const tone = (v: bigint) => (v < 0n ? "text-down" : "text-up");

/** Position tab: shares, value, funding earned 24h + hourly breakdown (your share of vault funding) */
export function PositionView() {
  const { address, position } = useVaultPosition();
  const vault = useVaultState().data;
  const payments = useVaultFunding().data;
  const value = vault && position ? toAssets(position.shares, vault.totalAssets, vault.totalSupply) : undefined;
  const hours = position && vault && payments ? hourlyFunding(payments, position.shares, vault.totalSupply) : undefined;
  const day = hours?.slice(0, 24).reduce((s, h) => s + h.earned, 0n);

  if (!address) return <EmptyState className="min-h-[200px]">Connect a wallet to see your shares.</EmptyState>;
  return (
    <div className="scrollbar-none min-h-0 flex-1 overflow-auto">
      <StatStrip className="grid-cols-3 border-b border-border lg:grid">
        <StatBox label="Shares" value={position ? formatShares(position.shares) : DASH} />
        <StatBox label="Value" value={value === undefined ? DASH : `$${formatUsdcRaw(value)}`} />
        <StatBox label="Funding 24h" value={day === undefined || !hours?.length ? DASH : <span className={tone(day)}>{signed(day)}</span>} />
      </StatStrip>
      {hours && hours.length === 0 ? (
        <EmptyState className="min-h-[96px] text-sm">First funding payment lands on the hour.</EmptyState>
      ) : (
        <Table aria-label="Hourly earnings">
          <thead>
            <tr>
              <Th>Hour</Th>
              <Th className="text-right">Funding</Th>
            </tr>
          </thead>
          <tbody>
            {hours?.slice(0, 24).map((h) => (
              <Tr key={h.ts}>
                <Td className="font-mono text-xs text-fg-muted">{formatUtcStamp(h.ts)}</Td>
                <Td className={`text-right ${tone(h.earned)}`}>{signed(h.earned)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
