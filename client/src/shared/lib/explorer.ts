import { EXPLORER_URL } from "@/shared/config/near";

export const txUrl = (hash: string) => `${EXPLORER_URL}/txns/${hash}`;
export const addressUrl = (account: string) => `${EXPLORER_URL}/address/${account}`;
