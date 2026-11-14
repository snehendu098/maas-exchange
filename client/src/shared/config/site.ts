// public origin for canonical/OG urls; set NEXT_PUBLIC_SITE_URL per deploy
export const SITE = {
  name: "MaaS Exchange",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://maas.exchange").replace(/\/$/, ""),
  title: "MaaS Exchange — perps and a delta-neutral USDC vault on NEAR",
  description:
    "Self-custodied perpetual futures on BTC, ETH and NEAR, plus a delta-neutral USDC vault that earns funding. Built on NEAR.",
  keywords: ["perpetual futures", "perps", "DEX", "delta neutral vault", "funding rate", "NEAR", "USDC", "Pyth"],
} as const;
