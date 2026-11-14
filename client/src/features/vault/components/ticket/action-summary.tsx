import { formatUsdcRaw } from "@/shared/lib/units";
import type { VaultState } from "../../api/types";
import { sharePrice } from "../../lib/share-math";
import { formatBpsPercent, formatSharePrice, formatShares } from "../../lib/vault-format";
import type { DepositPreview, WithdrawPreview } from "../../lib/vault-preview";
import { Dash, SummaryRow } from "../ui/summary-row";

const usdc = (raw: bigint) => `${formatUsdcRaw(raw)} USDC`;

export function DepositSummary({ preview, vault }: { preview: DepositPreview; vault?: VaultState }) {
  return (
    <dl className="space-y-3 text-sm" aria-label="Deposit breakdown">
      <SummaryRow label="Shares minted" className={preview.shares > 0n ? "text-positive" : undefined}>
        {preview.shares > 0n ? formatShares(preview.shares) : <Dash />}
      </SummaryRow>
      <SummaryRow label="Share price">{vault ? formatSharePrice(sharePrice(vault.totalAssets, vault.totalSupply)) : <Dash />}</SummaryRow>
      <SummaryRow label="Deposit fee">0.00%</SummaryRow>
      <SummaryRow label="Withdraw fee (later)">{vault ? formatBpsPercent(vault.config.withdrawFeeBps) : <Dash />}</SummaryRow>
    </dl>
  );
}

export function WithdrawSummary({ preview, vault }: { preview: WithdrawPreview; vault?: VaultState }) {
  const s = preview.split;
  const feeLabel = `Withdraw fee (${vault ? formatBpsPercent(vault.config.withdrawFeeBps) : "—"})`;
  return (
    <dl className="space-y-3 text-sm" aria-label="Withdraw breakdown">
      <SummaryRow label="Shares burned">{s ? formatShares(preview.shares) : <Dash />}</SummaryRow>
      <SummaryRow label={feeLabel}>{s ? usdc(s.fee) : <Dash />}</SummaryRow>
      <SummaryRow label="You receive" className={s && s.net > 0n ? "text-positive" : undefined}>
        {s ? usdc(s.net) : <Dash />}
      </SummaryRow>
    </dl>
  );
}
