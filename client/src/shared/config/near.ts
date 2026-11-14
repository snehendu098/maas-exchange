import { env } from "./env";

export const NETWORK = env.nearNetwork;
export const RPC_URL = env.nearRpcUrl ?? `https://rpc.${NETWORK}.near.org`;
export const EXPLORER_URL = NETWORK === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";

export const CONTRACTS = {
  exchange: env.exchangeContract,
  vault: env.vaultContract,
  usdc: env.usdcContract,
} as const;
