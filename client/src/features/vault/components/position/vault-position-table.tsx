import Link from "next/link";
import { routes } from "@/shared/config/navigation";
import { formatUsdcRaw } from "@/shared/lib/units";
import { Table, Td, Th, Tr } from "@/shared/ui/table";
import { TokenLogo, USDC_ICON } from "@/shared/ui/token-logo";
import type { VaultHolding } from "../../lib/holding";
import { formatSharePrice, formatShares } from "../../lib/vault-format";

/** Vault stake row for position lists; Manage opens the vault page. */
export function VaultPositionTable({ holding }: { holding: VaultHolding }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Vault</Th>
          <Th className="text-right">Shares</Th>
          <Th className="text-right">Share price</Th>
          <Th className="text-right">Value</Th>
          <Th className="text-right">Queued exit</Th>
          <Th className="text-right">Manage</Th>
        </tr>
      </thead>
      <tbody>
        <Tr>
          <Td>
            <span className="flex items-center gap-2">
              <TokenLogo asset={USDC_ICON} size={20} />
              USDC Vault
              <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] leading-none font-medium text-fg-muted">Delta-neutral</span>
            </span>
          </Td>
          <Td className="text-right">{formatShares(holding.shares)}</Td>
          <Td className="text-right">{formatSharePrice(holding.price)}</Td>
          <Td className="text-right">${formatUsdcRaw(holding.value)}</Td>
          <Td className="text-right text-fg-muted">{holding.pending > 0n ? `$${formatUsdcRaw(holding.pending)}` : "—"}</Td>
          <Td className="text-right">
            <Link
              href={routes.vault("position")}
              className="focus-ring inline-flex h-7 items-center rounded-full bg-surface-raised px-3 text-xs font-medium text-fg transition-colors hover:bg-surface-strong"
            >
              Manage
            </Link>
          </Td>
        </Tr>
      </tbody>
    </Table>
  );
}
