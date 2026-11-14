import { actionCreators, type FinalExecutionOutcome } from "@near-wallet-selector/core";
import { getSelector } from "./selector";

export const TGAS = 10n ** 12n;
export const ONE_YOCTO = 1n;

export interface ContractCall {
  receiverId: string;
  method: string;
  args: object;
  deposit?: bigint;
  gas?: bigint;
}

/** Decoded JSON return of the last tx; undefined for redirect wallets or void returns. */
export function returnValue<T>(outcomes: FinalExecutionOutcome[] | void): T | undefined {
  const last = outcomes?.at(-1)?.status;
  if (!last || typeof last !== "object" || !("SuccessValue" in last) || !last.SuccessValue) return undefined;
  return JSON.parse(atob(last.SuccessValue)) as T;
}

/** One tx per call, signed + sent by the selected wallet. */
export async function sendCalls(calls: ContractCall[]): Promise<FinalExecutionOutcome[] | void> {
  const { selector } = await getSelector();
  if (!selector.isSignedIn()) throw new Error("Connect a wallet first");
  const wallet = await selector.wallet();
  return wallet.signAndSendTransactions({
    transactions: calls.map((c) => ({
      receiverId: c.receiverId,
      actions: [actionCreators.functionCall(c.method, c.args, c.gas ?? 100n * TGAS, c.deposit ?? 0n)],
    })),
  });
}
