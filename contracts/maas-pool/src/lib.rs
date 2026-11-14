//! MaaS spot pools: full-range constant product, USDC vs base, one pool per perp market (pool id = market id).
//!
//! NEAR port of the EVM MaasHook. JIT defence: swap fees and rewards are not added to reserves but
//! streamed to LPs over `DURATION`, pro rata to liquidity x time. Liquidity added for one block earns
//! one block's slice. Fee: oracle-aware dynamic (base + share of the price gap a swap opens), 0 for the vault.
//!
//! Ref-compatible subset so delta-vault needs no changes: deposit via `ft_transfer_call(pool, amt, "")`,
//! `swap(actions)` on internal deposits, `withdraw(token_id, amount)`.
use near_contract_standards::fungible_token::core::ext_ft_core;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json};
use near_sdk::store::{LookupMap, Vector};
use near_sdk::{
    assert_one_yocto, env, near, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault,
    Promise, PromiseError, PromiseOrValue,
};
use perp_math::mul_div;

#[cfg(test)]
mod tests;

pub const DURATION_MS: u64 = 3_600_000;
pub const BPS: u128 = 10_000;
/// Reward-per-share scale.
const Q: u128 = 1_000_000_000_000_000_000_000_000;
/// First LP mints this many shares (Ref style).
pub const INIT_SHARES: u128 = 1_000_000_000_000_000_000;
const GAS_FT: Gas = Gas::from_tgas(10);
const GAS_CB: Gas = Gas::from_tgas(10);
/// Token index inside a pool.
const USDC: usize = 0;
const BASE: usize = 1;

#[near]
#[derive(BorshStorageKey)]
enum Key {
    Pools,
    Lps,
    Deposits,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Params {
    pub base_fee_bps: u32,
    /// Share (bps) of the oracle gap a swap opens, added to the fee.
    pub gap_share_bps: u32,
    pub cap_bps: u32,
    pub stale_fee_bps: u32,
    pub max_price_age_ms: u64,
}

/// Linear payout of `left` until `finish`; `rps` is cumulative reward per share * Q.
#[near(serializers = [borsh, json])]
#[derive(Clone, Default, Debug)]
pub struct Stream {
    pub left: U128,
    pub finish: u64,
    pub updated: u64,
    pub rps: U128,
}

#[near(serializers = [borsh])]
pub struct Pool {
    base: AccountId,
    unit: u128,
    /// [usdc, base]
    reserves: [u128; 2],
    shares: u128,
    streams: [Stream; 2],
    /// Oracle: USDC 1e6 per 1 whole base.
    price: u128,
    price_ms: u64,
}

#[near(serializers = [borsh])]
#[derive(Default)]
pub struct Lp {
    shares: u128,
    paid: [u128; 2],
    owed: [u128; 2],
}

#[near(serializers = [json])]
pub struct PoolView {
    pub base: AccountId,
    pub base_decimals: u8,
    pub reserves: [U128; 2],
    pub shares: U128,
    pub streams: [Stream; 2],
    pub price: U128,
    pub price_ms: u64,
}

#[near(serializers = [json])]
pub struct LpView {
    pub shares: U128,
    /// Claimable [usdc, base] now.
    pub earned: [U128; 2],
}

#[near(serializers = [json])]
pub struct Quote {
    pub amount_out: U128,
    pub fee_bps: u32,
}

/// Ref's SwapAction shape.
#[near(serializers = [json])]
pub struct SwapAction {
    pub pool_id: u64,
    pub token_in: AccountId,
    pub amount_in: Option<U128>,
    pub token_out: AccountId,
    pub min_amount_out: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MaasPool {
    owner: AccountId,
    keeper: AccountId,
    vault: AccountId,
    usdc: AccountId,
    params: Params,
    pools: Vector<Pool>,
    lps: LookupMap<(u32, AccountId), Lp>,
    deposits: LookupMap<(AccountId, AccountId), u128>,
}

fn emit(event: &str, data: serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({"standard": "maas-pool", "version": "1.0.0", "event": event, "data": [data]})
    ));
}

fn validate(p: &Params) {
    assert!(p.cap_bps <= 1000, "cap > 10%");
    assert!(p.gap_share_bps as u128 <= BPS, "gap share > 100%");
    assert!(p.max_price_age_ms > 0, "max age 0");
}

impl Stream {
    /// Pays out up to `now` to `shares`; with no shares the stream pauses (finish moves out).
    fn accrue(&mut self, shares: u128, now: u64) {
        if now <= self.updated {
            return;
        }
        if shares == 0 {
            if self.finish > self.updated {
                self.finish += now - self.updated;
            }
        } else if self.left.0 > 0 && self.finish > self.updated {
            let end = now.min(self.finish);
            let give = mul_div(
                self.left.0,
                (end - self.updated) as u128,
                (self.finish - self.updated) as u128,
                false,
            );
            self.left.0 -= give;
            self.rps.0 += mul_div(give, Q, shares, false);
        }
        self.updated = now;
    }

    /// Adds `amount` and restarts the window: everything unpaid streams over the next DURATION.
    fn notify(&mut self, shares: u128, amount: u128, now: u64) {
        self.accrue(shares, now);
        self.left.0 += amount;
        self.finish = now + DURATION_MS;
        self.updated = now;
    }
}

impl Lp {
    fn checkpoint(&mut self, streams: &[Stream; 2]) {
        for t in 0..2 {
            let rps = streams[t].rps.0;
            self.owed[t] += mul_div(self.shares, rps - self.paid[t], Q, false);
            self.paid[t] = rps;
        }
    }
}

#[near]
impl MaasPool {
    #[init]
    pub fn new(
        owner: AccountId,
        keeper: AccountId,
        vault: AccountId,
        usdc: AccountId,
        params: Params,
    ) -> Self {
        validate(&params);
        Self {
            owner,
            keeper,
            vault,
            usdc,
            params,
            pools: Vector::new(Key::Pools),
            lps: LookupMap::new(Key::Lps),
            deposits: LookupMap::new(Key::Deposits),
        }
    }

    // ---- admin ----

    /// Owner: new USDC/base pool; id must match the perp market id.
    pub fn add_pool(&mut self, base: AccountId, base_decimals: u8) -> u32 {
        self.only(&self.owner.clone());
        assert!(base != self.usdc, "base is usdc");
        let id = self.pools.len();
        self.pools.push(Pool {
            base: base.clone(),
            unit: 10u128.pow(base_decimals as u32),
            reserves: [0; 2],
            shares: 0,
            streams: Default::default(),
            price: 0,
            price_ms: 0,
        });
        emit("pool_added", json!({"pool_id": id, "base": base}));
        id
    }

    pub fn set_params(&mut self, params: Params) {
        self.only(&self.owner.clone());
        validate(&params);
        self.params = params;
    }

    pub fn set_vault(&mut self, vault: AccountId) {
        self.only(&self.owner.clone());
        self.vault = vault;
    }

    pub fn set_keeper(&mut self, keeper: AccountId) {
        self.only(&self.owner.clone());
        self.keeper = keeper;
    }

    /// Keeper: oracle prices, same shape as the exchange's push_prices. Older points skipped.
    pub fn push_prices(&mut self, prices: Vec<(u32, U128, u64)>) {
        self.only(&self.keeper.clone());
        let now = env::block_timestamp_ms();
        for (id, price, ms) in prices {
            assert!(price.0 > 0, "bad price");
            assert!(ms <= now, "future price");
            let p = self.pool_mut(id);
            if p.price_ms < ms {
                (p.price, p.price_ms) = (price.0, ms);
            }
        }
    }

    // ---- ref-compatible deposits / swap ----

    /// Exact-in, one action, on the caller's internal deposits. Returns amount out.
    #[payable]
    pub fn swap(&mut self, actions: Vec<SwapAction>, referral_id: Option<AccountId>) -> U128 {
        assert_one_yocto();
        let _ = referral_id;
        assert_eq!(actions.len(), 1, "one action"); // ponytail: no multi-hop, every pool is vs USDC
        let a = &actions[0];
        let me = env::predecessor_account_id();
        let id = a.pool_id as u32;
        let amount = a.amount_in.expect("amount_in required").0;
        assert!(amount > 0, "bad amount");
        let base = self.pool(id).base.clone();
        let i = if a.token_in == self.usdc && a.token_out == base {
            USDC
        } else if a.token_in == base && a.token_out == self.usdc {
            BASE
        } else {
            panic!("bad pair")
        };
        let bps = if me == self.vault {
            0
        } else {
            self.fee_bps(id, i, amount)
        };
        let fee = mul_div(amount, bps as u128, BPS, true);
        let out = self.out(id, i, amount - fee);
        assert!(out > 0 && out >= a.min_amount_out.0, "slippage");
        self.debit(&me, &a.token_in, amount);
        let now = env::block_timestamp_ms();
        let p = self.pool_mut(id);
        p.reserves[i] += amount - fee;
        p.reserves[1 - i] -= out;
        if fee > 0 {
            p.streams[i].notify(p.shares, fee, now);
        }
        self.credit(&me, &a.token_out, out);
        emit(
            "swapped",
            json!({"pool_id": id, "account_id": me, "token_in": a.token_in, "amount_in": U128(amount),
                   "amount_out": U128(out), "fee": U128(fee), "fee_bps": bps}),
        );
        U128(out)
    }

    /// Sends from internal deposit; resolves to the amount sent (0 + re-credit if the transfer failed).
    #[payable]
    pub fn withdraw(
        &mut self,
        token_id: AccountId,
        amount: U128,
        unregister: Option<bool>,
    ) -> Promise {
        assert_one_yocto();
        let _ = unregister;
        let me = env::predecessor_account_id();
        assert!(amount.0 > 0, "bad amount");
        self.debit(&me, &token_id, amount.0);
        ext_ft_core::ext(token_id.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT)
            .ft_transfer(me.clone(), amount, None)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CB)
                    .on_withdraw(me, token_id, amount),
            )
    }

    #[private]
    pub fn on_withdraw(
        &mut self,
        account_id: AccountId,
        token_id: AccountId,
        amount: U128,
        #[callback_result] res: Result<(), PromiseError>,
    ) -> U128 {
        if res.is_ok() {
            return amount;
        }
        self.credit(&account_id, &token_id, amount.0);
        U128(0)
    }

    // ---- liquidity ----

    /// From internal deposits, full range. First LP sets the price. Returns shares minted.
    pub fn add_liquidity(&mut self, pool_id: u32, amounts: [U128; 2], min_shares: U128) -> U128 {
        let me = env::predecessor_account_id();
        let mut lp = self.touch(pool_id, &me);
        let p = self.pool(pool_id);
        let (r, total) = (p.reserves, p.shares);
        let (used, minted) = if total == 0 {
            assert!(amounts[0].0 > 0 && amounts[1].0 > 0, "bad amount");
            ([amounts[0].0, amounts[1].0], INIT_SHARES)
        } else {
            let s = mul_div(amounts[0].0, total, r[0], false).min(mul_div(
                amounts[1].0,
                total,
                r[1],
                false,
            ));
            (
                [mul_div(s, r[0], total, true), mul_div(s, r[1], total, true)],
                s,
            )
        };
        assert!(minted > 0 && minted >= min_shares.0, "min shares");
        let base = p.base.clone();
        self.debit(&me, &self.usdc.clone(), used[0]);
        self.debit(&me, &base, used[1]);
        let p = self.pool_mut(pool_id);
        p.reserves[0] += used[0];
        p.reserves[1] += used[1];
        p.shares += minted;
        lp.shares += minted;
        self.lps.insert((pool_id, me.clone()), lp);
        emit(
            "liquidity_added",
            json!({"pool_id": pool_id, "account_id": me, "amounts": [U128(used[0]), U128(used[1])], "shares": U128(minted)}),
        );
        U128(minted)
    }

    /// Any time, no penalty: the unstreamed rest of the fees stays with remaining LPs.
    pub fn remove_liquidity(
        &mut self,
        pool_id: u32,
        shares: U128,
        min_amounts: [U128; 2],
    ) -> [U128; 2] {
        let me = env::predecessor_account_id();
        let mut lp = self.touch(pool_id, &me);
        assert!(shares.0 > 0 && shares.0 <= lp.shares, "bad shares");
        let p = self.pool(pool_id);
        let out = [
            mul_div(shares.0, p.reserves[0], p.shares, false),
            mul_div(shares.0, p.reserves[1], p.shares, false),
        ];
        assert!(
            out[0] >= min_amounts[0].0 && out[1] >= min_amounts[1].0,
            "slippage"
        );
        let base = p.base.clone();
        let p = self.pool_mut(pool_id);
        p.reserves[0] -= out[0];
        p.reserves[1] -= out[1];
        p.shares -= shares.0;
        lp.shares -= shares.0;
        self.lps.insert((pool_id, me.clone()), lp);
        self.credit(&me, &self.usdc.clone(), out[0]);
        self.credit(&me, &base, out[1]);
        emit(
            "liquidity_removed",
            json!({"pool_id": pool_id, "account_id": me, "amounts": [U128(out[0]), U128(out[1])], "shares": shares}),
        );
        [U128(out[0]), U128(out[1])]
    }

    /// Moves earned fees/rewards to internal deposits.
    pub fn claim(&mut self, pool_id: u32) -> [U128; 2] {
        let me = env::predecessor_account_id();
        let mut lp = self.touch(pool_id, &me);
        let got = lp.owed;
        lp.owed = [0; 2];
        self.lps.insert((pool_id, me.clone()), lp);
        let base = self.pool(pool_id).base.clone();
        self.credit(&me, &self.usdc.clone(), got[0]);
        self.credit(&me, &base, got[1]);
        emit(
            "claimed",
            json!({"pool_id": pool_id, "account_id": me, "amounts": [U128(got[0]), U128(got[1])]}),
        );
        [U128(got[0]), U128(got[1])]
    }

    // ---- views ----

    pub fn params(&self) -> Params {
        self.params.clone()
    }

    pub fn vault(&self) -> AccountId {
        self.vault.clone()
    }

    pub fn number_of_pools(&self) -> u32 {
        self.pools.len()
    }

    pub fn pool_view(&self, pool_id: u32) -> PoolView {
        let p = self.pool(pool_id);
        PoolView {
            base: p.base.clone(),
            base_decimals: p.unit.ilog10() as u8,
            reserves: [U128(p.reserves[0]), U128(p.reserves[1])],
            shares: U128(p.shares),
            streams: p.streams.clone(),
            price: U128(p.price),
            price_ms: p.price_ms,
        }
    }

    pub fn get_deposit(&self, account_id: AccountId, token_id: AccountId) -> U128 {
        U128(
            self.deposits
                .get(&(account_id, token_id))
                .copied()
                .unwrap_or(0),
        )
    }

    pub fn lp(&self, pool_id: u32, account_id: AccountId) -> LpView {
        let p = self.pool(pool_id);
        let mut streams = p.streams.clone();
        for s in &mut streams {
            s.accrue(p.shares, env::block_timestamp_ms());
        }
        let mut lp = self
            .lps
            .get(&(pool_id, account_id))
            .map_or_else(Lp::default, |l| Lp {
                shares: l.shares,
                paid: l.paid,
                owed: l.owed,
            });
        lp.checkpoint(&streams);
        LpView {
            shares: U128(lp.shares),
            earned: [U128(lp.owed[0]), U128(lp.owed[1])],
        }
    }

    /// Non-vault quote: out after the dynamic fee.
    pub fn quote(&self, pool_id: u32, token_in: AccountId, amount_in: U128) -> Quote {
        let i = if token_in == self.usdc { USDC } else { BASE };
        let bps = self.fee_bps(pool_id, i, amount_in.0);
        let fee = mul_div(amount_in.0, bps as u128, BPS, true);
        Quote {
            amount_out: U128(self.out(pool_id, i, amount_in.0 - fee)),
            fee_bps: bps,
        }
    }

    /// base + gap_share x (oracle gap after swap, bps) when the swap widens the gap; capped.
    /// Stale/missing oracle: stale fee.
    pub fn fee_bps(&self, pool_id: u32, i: usize, amount_in: u128) -> u32 {
        let (pr, p) = (&self.params, self.pool(pool_id));
        let now = env::block_timestamp_ms();
        if p.price == 0 || now.saturating_sub(p.price_ms) > pr.max_price_age_ms {
            return pr.stale_fee_bps.min(pr.cap_bps);
        }
        let out = self.out(pool_id, i, amount_in);
        let mut r = p.reserves;
        r[i] += amount_in;
        r[1 - i] -= out;
        let gap = |r: [u128; 2]| mul_div(r[0], p.unit, r[1], false).abs_diff(p.price);
        let (before, after) = (gap(p.reserves), gap(r));
        let mut fee = pr.base_fee_bps as u128;
        if after > before {
            let gap_bps = mul_div(after, BPS, p.price, false);
            fee += mul_div(gap_bps, pr.gap_share_bps as u128, BPS, false);
        }
        fee.min(pr.cap_bps as u128) as u32
    }
}

#[near]
impl FungibleTokenReceiver for MaasPool {
    /// msg "" = deposit for sender. msg {"reward": pool_id} = stream to that pool's LPs over 1h.
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let token = env::predecessor_account_id();
        if msg.is_empty() {
            assert!(
                token == self.usdc || self.pools.iter().any(|p| p.base == token),
                "unknown token"
            );
            self.credit(&sender_id, &token, amount.0);
            return PromiseOrValue::Value(U128(0));
        }
        #[derive(near_sdk::serde::Deserialize)]
        #[serde(crate = "near_sdk::serde")]
        struct Reward {
            reward: u32,
        }
        let r: Reward = serde_json::from_str(&msg).expect("bad msg");
        let usdc = self.usdc.clone();
        let now = env::block_timestamp_ms();
        let p = self.pool_mut(r.reward);
        let i = if token == usdc {
            USDC
        } else if token == p.base {
            BASE
        } else {
            panic!("token not in pool")
        };
        p.streams[i].notify(p.shares, amount.0, now);
        emit(
            "reward_added",
            json!({"pool_id": r.reward, "from": sender_id, "token": token, "amount": amount}),
        );
        PromiseOrValue::Value(U128(0))
    }
}

impl MaasPool {
    fn only(&self, who: &AccountId) {
        assert_eq!(&env::predecessor_account_id(), who, "unauthorized");
    }

    fn pool(&self, id: u32) -> &Pool {
        self.pools.get(id).expect("no pool")
    }

    fn pool_mut(&mut self, id: u32) -> &mut Pool {
        self.pools.get_mut(id).expect("no pool")
    }

    /// x*y=k out for `net` of token i in.
    fn out(&self, id: u32, i: usize, net: u128) -> u128 {
        let r = self.pool(id).reserves;
        assert!(r[0] > 0 && r[1] > 0, "empty pool");
        mul_div(r[1 - i], net, r[i] + net, false)
    }

    /// Accrues the pool's streams and checkpoints `who` before any share change.
    fn touch(&mut self, id: u32, who: &AccountId) -> Lp {
        let now = env::block_timestamp_ms();
        let p = self.pool_mut(id);
        let shares = p.shares;
        for s in &mut p.streams {
            s.accrue(shares, now);
        }
        let streams = p.streams.clone();
        let mut lp = self.lps.remove(&(id, who.clone())).unwrap_or_default();
        if lp.shares == 0 {
            lp.paid = [streams[0].rps.0, streams[1].rps.0];
        }
        lp.checkpoint(&streams);
        lp
    }

    // ponytail: contract pays deposit/LP storage; add NEP-145 storage_deposit if spam matters
    fn credit(&mut self, who: &AccountId, token: &AccountId, amount: u128) {
        if amount == 0 {
            return;
        }
        *self
            .deposits
            .entry((who.clone(), token.clone()))
            .or_insert(0) += amount;
    }

    fn debit(&mut self, who: &AccountId, token: &AccountId, amount: u128) {
        let k = (who.clone(), token.clone());
        let bal = self.deposits.get(&k).copied().unwrap_or(0);
        assert!(bal >= amount, "insufficient deposit");
        if bal == amount {
            self.deposits.remove(&k);
        } else {
            self.deposits.insert(k, bal - amount);
        }
    }
}
