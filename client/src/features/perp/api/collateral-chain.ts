import { ONE_YOCTO, sendCalls, TGAS } from "@/features/wallet/lib/transact";
import { CONTRACTS } from "@/shared/config/near";
import { view } from "@/shared/lib/near-rpc";
import type { CollateralApi } from "./types";

/** USDC (NEP-141) + exchange collateral moves. */
export function createChainCollateral(): CollateralApi {
  return {
    walletBalance: async (trader) => BigInt(await view<string>(CONTRACTS.usdc, "ft_balance_of", { account_id: trader })),
    deposit: async (amount) => {
      await sendCalls([
        {
          receiverId: CONTRACTS.usdc,
          method: "ft_transfer_call",
          args: { receiver_id: CONTRACTS.exchange, amount: amount.toString(), msg: "" },
          deposit: ONE_YOCTO,
          gas: 150n * TGAS,
        },
      ]);
    },
    withdraw: async (amount) => {
      await sendCalls([{ receiverId: CONTRACTS.exchange, method: "withdraw", args: { amount: amount.toString() }, gas: 100n * TGAS }]);
    },
  };
}
