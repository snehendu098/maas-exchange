import { cn } from "@/shared/lib/cn";

export interface TokenLogoAsset {
  symbol: string;
  color: string;
  glyph?: string;
}

interface TokenLogoProps {
  asset: TokenLogoAsset;
  size?: number;
  className?: string;
}

// svgs in public/tokens
const LOGOS: Record<string, string> = {
  BTC: "/tokens/btc.svg",
  WBTC: "/tokens/btc.svg",
  ETH: "/tokens/eth.svg",
  WETH: "/tokens/eth.svg",
  NEAR: "/tokens/near.svg",
  USDC: "/tokens/usdc.svg",
};

export const USDC_ICON: TokenLogoAsset = { symbol: "USDC", color: "#2775ca", glyph: "$" };

/** Real coin logo; brand-colored disc fallback for unknown symbols. */
export function TokenLogo({ asset, size = 16, className }: TokenLogoProps) {
  const style = { width: size, height: size };
  const src = LOGOS[asset.symbol.toUpperCase()];

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- tiny static svg, no optimizer needed
    return <img src={src} alt="" aria-hidden width={size} height={size} style={style} className={cn("shrink-0 rounded-full", className)} />;
  }

  const glyph = asset.glyph ?? asset.symbol.charAt(0);
  return (
    <span
      aria-hidden
      style={{ ...style, backgroundColor: asset.color, fontSize: size * (glyph.length > 1 ? 0.36 : 0.5) }}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full leading-none font-semibold text-white/90", className)}
    >
      {glyph}
    </span>
  );
}
