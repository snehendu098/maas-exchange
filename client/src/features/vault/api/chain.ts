import { returnValue, sendCalls, TGAS, ONE_YOCTO, type ContractCall } from "@/features/wallet/lib/transact";
import { getMarketByIdOrThrow } from "@/shared/config/markets";
import { CONTRACTS } from "@/shared/config/near";
import { VAULT_MARKETS } from "@/shared/config/vault";
import { view } from "@/shared/lib/near-rpc";
import { withdrawFee } from "../lib/withdraw-math";
import { toAssets } from "../lib/share-math";
import type { RedeemResult, VaultApi, VaultLeg, VaultMode, VaultState, WithdrawRequest } from "./types";

const SIZE_UNIT = 10n ** 8n;

interface RawConfig {
  weights_bps: number[];
  short_leverage_bps: number;
  idle_buffer_bps: number;
  withdraw_fee_bps: number;
  cooldown_ms: number | string;
}

interface RawRequest {
  owner: string;
  shares: string;
}

const big = (v: string | number) => BigInt(v);
const toMode = (m: string): VaultMode => (m.toLowerCase() === "hedged" ? "HEDGED" : "FLAT");
const vault = <T>(method: string, args: object = {}) => view<T>(CONTRACTS.vault, method, args);

/** Register owner on the share token if needed; ft_on_transfer can't mint to unregistered accounts. */
async function storageCalls(owner: string): Promise<ContractCall[]> {
  const bal = await vault<unknown>("storage_balance_of", { account_id: owner }).catch(() => "skip");
  if (bal !== null) return [];
  const { min } = await vault<{ min: string }>("storage_balance_bounds");
  return [{ receiverId: CONTRACTS.vault, method: "storage_deposit", args: { account_id: owner, registration_only: true }, deposit: big(min) }];
}

/** Vault contract + USDC + exchange views. */
export function createChainVaultApi(): VaultApi {
  const getVault = async (): Promise<VaultState> => {
    const ids = VAULT_MARKETS.map((_, i) => i);
    const [nav, supply, idle, cfg, legs] = await Promise.all([
      vault<string>("nav"),
      vault<string>("ft_total_supply"),
      view<string>(CONTRACTS.usdc, "ft_balance_of", { account_id: CONTRACTS.vault }),
      vault<RawConfig>("config"),
      Promise.all(
        ids.map(async (m) => {
          const [mode, spot, pos] = await Promise.all([
            vault<string>("mode", { market: m }),
            vault<string>("spot_size", { market: m }),
            view<{ size: string } | null>(CONTRACTS.exchange, "position", { account_id: CONTRACTS.vault, market_id: m }),
          ]);
          const spotSize = big(spot);
          // price view rejects stale prices; only needed when spot is held
          const price = spotSize > 0n ? big(await view<string>(CONTRACTS.exchange, "price", { market_id: m })) : 0n;
          const size = pos ? big(pos.size) : 0n;
          const leg: Omit<VaultLeg, "weightBps"> = {
            market: getMarketByIdOrThrow(m).symbol,
            mode: toMode(mode),
            spotSize,
            shortSize: size < 0n ? -size : 0n,
            spotValue: (price * spotSize) / SIZE_UNIT,
          };
          return leg;
        }),
      ),
    ]);
    return {
      totalAssets: big(nav),
      totalSupply: big(supply),
      idle: big(idle),
      config: {
        withdrawFeeBps: cfg.withdraw_fee_bps,
        idleBufferBps: cfg.idle_buffer_bps,
        shortLeverage: cfg.short_leverage_bps / 10_000,
        cooldownSec: Number(cfg.cooldown_ms) / 1000,
      },
      legs: legs.map((l, i) => ({ ...l, weightBps: cfg.weights_bps[i] ?? 0 })),
    };
  };

  // shortcut: one view per request id ever queued; index requests in the backend if ids grow large
  const getRequests = async (owner: string, state: VaultState): Promise<WithdrawRequest[]> => {
    const next = Number(await vault<number | string>("next_request_id"));
    const ids = Array.from({ length: next }, (_, i) => BigInt(i));
    const rows = await Promise.all(ids.map((id) => vault<RawRequest | null>("requests", { id: Number(id) }).catch(() => null)));
    return ids
      .flatMap((id, i) => {
        const r = rows[i];
        if (!r || r.owner !== owner || big(r.shares) === 0n) return [];
        const gross = toAssets(big(r.shares), state.totalAssets, state.totalSupply);
        const fee = withdrawFee(gross, state.config.withdrawFeeBps);
        return [{ id, shares: big(r.shares), assets: gross - fee, fee, status: "PENDING" as const }];
      })
      .reverse();
  };

  return {
    getVault,

    getPosition: async (owner) => {
      const [walletUsdc, shares, state] = await Promise.all([
        view<string>(CONTRACTS.usdc, "ft_balance_of", { account_id: owner }),
        vault<string>("ft_balance_of", { account_id: owner }),
        getVault(),
      ]);
      return { walletUsdc: big(walletUsdc), shares: big(shares), requests: await getRequests(owner, state) };
    },

    deposit: async (owner, assets) => {
      await sendCalls([
        ...(await storageCalls(owner)),
        {
          receiverId: CONTRACTS.usdc,
          method: "ft_transfer_call",
          args: { receiver_id: CONTRACTS.vault, amount: assets.toString(), msg: "" },
          deposit: ONE_YOCTO,
          gas: 200n * TGAS,
        },
      ]);
    },

    redeem: async (shares) => {
      const out = returnValue<{ id: number | string | null; assets: string }>(
        await sendCalls([{ receiverId: CONTRACTS.vault, method: "request_redeem", args: { shares: shares.toString() }, gas: 150n * TGAS }]),
      );
      if (!out) return undefined;
      const res: RedeemResult = { requestId: out.id === null ? null : big(out.id), instant: big(out.assets) };
      return res;
    },

    cancelRequest: async (id) => {
      await sendCalls([{ receiverId: CONTRACTS.vault, method: "cancel_request", args: { id: Number(id) } }]);
    },
  };
}
