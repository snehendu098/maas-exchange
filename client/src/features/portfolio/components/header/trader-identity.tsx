import { Wallet } from "lucide-react";
import { truncateAddress } from "@/shared/lib/format";
import { AddressAvatar } from "@/shared/ui/address-avatar";

/** Left cell of the asset bar: wallet orb + address. */
export function TraderIdentity({ trader, positions }: { trader?: string; positions: number }) {
  return (
    <div className="flex min-h-16 shrink-0 items-center gap-3.5 border-b border-border px-5 lg:border-b-0 lg:pr-6">
      {trader ? (
        <AddressAvatar address={trader} />
      ) : (
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-fg-muted">
          <Wallet className="size-4" strokeWidth={1.75} />
        </span>
      )}
      <span className="flex flex-col items-start">
        <h1 className="text-xl leading-tight">{trader ? truncateAddress(trader, 6, 4) : "Portfolio"}</h1>
        <span className="font-mono text-[11px] text-fg-muted">
          {trader ? `${positions} open position${positions === 1 ? "" : "s"}` : "No wallet connected"}
        </span>
      </span>
    </div>
  );
}
