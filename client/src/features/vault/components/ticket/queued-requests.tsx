"use client";

import { formatUsdcRaw } from "@/shared/lib/units";
import { Button } from "@/shared/ui/button";
import { useVaultPosition } from "../../hooks/use-vault";
import { formatShares } from "../../lib/vault-format";

/** Queued withdraw requests waiting on keeper fulfill; cancel returns the shares. */
export function QueuedRequests() {
  const { position, cancelRequest, cancelPending } = useVaultPosition();
  const queued = position?.requests.filter((r) => r.status === "PENDING") ?? [];
  if (queued.length === 0) return null;
  return (
    <section aria-label="Queued withdrawals" className="space-y-2 text-sm">
      <h2 className="label-mono text-fg-muted">Queued withdrawals</h2>
      {queued.map((r) => (
        <div key={r.id.toString()} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
          <span className="font-mono text-xs text-fg-secondary">
            #{r.id.toString()} · {formatShares(r.shares)} shares · ~{formatUsdcRaw(r.assets)} USDC
          </span>
          <Button variant="outline" size="sm" disabled={cancelPending} onClick={() => cancelRequest(r.id)} className="h-7 rounded-full px-2.5 text-xs">
            Cancel
          </Button>
        </div>
      ))}
    </section>
  );
}
