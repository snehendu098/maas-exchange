import { TokenLogo, USDC_ICON } from "@/shared/ui/token-logo";

/** Left cell of the asset bar. */
export function VaultIdentity({ legs = 4 }: { legs?: number }) {
  return (
    <div className="flex min-h-16 shrink-0 items-center gap-3.5 border-b border-border px-5 lg:border-b-0 lg:pr-6">
      <TokenLogo asset={USDC_ICON} size={36} />
      <span className="flex flex-col items-start">
        <h1 className="text-xl leading-tight">USDC Vault</h1>
        <span className="font-mono text-[11px] text-fg-muted">Delta-neutral · {legs} markets</span>
      </span>
    </div>
  );
}
