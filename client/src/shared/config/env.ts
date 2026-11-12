export const env = {
  gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080",
  gatewayWsUrl: process.env.NEXT_PUBLIC_GATEWAY_WS_URL ?? "ws://localhost:8080/ws",
  nearNetwork: (process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet") as "testnet" | "mainnet",
  nearRpcUrl: process.env.NEXT_PUBLIC_NEAR_RPC_URL,
  exchangeContract: process.env.NEXT_PUBLIC_EXCHANGE_CONTRACT ?? "",
  vaultContract: process.env.NEXT_PUBLIC_VAULT_CONTRACT ?? "",
  usdcContract: process.env.NEXT_PUBLIC_USDC_CONTRACT ?? "",
} as const;
