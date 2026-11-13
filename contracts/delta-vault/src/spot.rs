use near_contract_standards::fungible_token::core::ext_ft_core;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, Gas, NearToken, Promise, PromiseError};
use perp_math::{mul_div, SIZE_UNIT};

use crate::events::emit;
use crate::ext::{ext_ref, RefSwapAction};
use crate::{DeltaVault, DeltaVaultExt, Mode, BPS, N};

const GAS_REF: Gas = Gas::from_tgas(60);
const GAS_CB: Gas = Gas::from_tgas(10);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[near]
impl DeltaVault {
    /// Keeper: swap at Ref using vault's Ref deposits. Buy only when Hedged; sell must keep
    /// spot >= |short|. Out >= max(min_out, oracle - slippage).
    pub fn swap(
        &mut self,
        market: u32,
        sell_base: bool,
        amount_in: U128,
        min_out: U128,
    ) -> Promise {
        self.assert_role(&self.keeper.clone(), "keeper");
        let (i, amt) = (market as usize, amount_in.0);
        assert!(i < N && amt > 0, "bad amount");
        self.fresh_nav();
        let min_out = self.swap_min_out(i, sell_base, amt).max(min_out.0);
        let base = self.markets[i].base_token.clone();
        let (token_in, token_out) = if sell_base {
            assert!(amt <= self.spot[i], "insufficient spot");
            let left = mul_div(self.spot[i] - amt, SIZE_UNIT, self.unit(i), false);
            let size = self.snapshot.sizes[i];
            assert!(size >= 0 || size.unsigned_abs() <= left, "over short");
            self.spot[i] -= amt;
            (base, self.usdc.clone())
        } else {
            assert!(self.mode[i] == Mode::Hedged, "not hedged");
            assert!(amt <= self.ref_usdc, "insufficient ref usdc");
            self.ref_usdc -= amt;
            (self.usdc.clone(), base)
        };
        self.begin_op();
        let action = RefSwapAction {
            pool_id: self.markets[i].ref_pool_id,
            token_in,
            amount_in: Some(amount_in),
            token_out,
            min_amount_out: min_out.into(),
        };
        ext_ref::ext(self.ref_exchange.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_REF)
            .swap(vec![action], None)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CB)
                    .on_swap(market, sell_base, amount_in),
            )
    }

    #[private]
    pub fn on_swap(
        &mut self,
        market: u32,
        sell_base: bool,
        amount_in: U128,
        #[callback_result] res: Result<U128, PromiseError>,
    ) -> U128 {
        self.end_op();
        let i = market as usize;
        let Ok(out) = res else {
            if sell_base {
                self.spot[i] += amount_in.0
            } else {
                self.ref_usdc += amount_in.0
            }
            return U128(0);
        };
        if sell_base {
            self.ref_usdc += out.0
        } else {
            self.spot[i] += out.0
        }
        emit(
            "swapped",
            json!({"market": market, "sell_base": sell_base, "amount_in": amount_in, "amount_out": out}),
        );
        out
    }

    /// Keeper: move unreserved idle USDC into vault's Ref deposit.
    pub fn ref_deposit(&mut self, amount: U128) -> Promise {
        self.assert_role(&self.keeper.clone(), "keeper");
        let nav = self.fresh_nav();
        assert!(amount.0 <= self.available(nav), "reserved");
        self.idle -= amount.0;
        self.begin_op();
        ext_ft_core::ext(self.usdc.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_REF)
            .ft_transfer_call(self.ref_exchange.clone(), amount, None, String::new())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CB)
                    .on_ref_deposit(amount),
            )
    }

    #[private]
    pub fn on_ref_deposit(&mut self, amount: U128) -> U128 {
        self.end_op();
        let used = used_amount();
        self.ref_usdc += used;
        self.idle += amount.0 - used;
        U128(used)
    }

    /// Keeper: pull USDC from vault's Ref deposit back to idle.
    pub fn ref_withdraw(&mut self, amount: U128) -> Promise {
        self.assert_role(&self.keeper.clone(), "keeper");
        assert!(amount.0 <= self.ref_usdc, "insufficient ref usdc");
        self.ref_usdc -= amount.0;
        self.begin_op();
        ext_ref::ext(self.ref_exchange.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_REF)
            .withdraw(self.usdc.clone(), amount, None)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CB)
                    .on_ref_withdraw(amount),
            )
    }

    /// Ref resolves to withdrawn amount (0 if its transfer failed and it re-credited us).
    #[private]
    pub fn on_ref_withdraw(&mut self, amount: U128) -> U128 {
        self.end_op();
        let got = match env::promise_result_checked(0, 64) {
            Ok(b) => near_sdk::serde_json::from_slice::<U128>(&b).map_or(amount.0, |u| u.0),
            Err(_) => 0,
        };
        self.idle += got;
        self.ref_usdc += amount.0 - got;
        U128(got)
    }
}

/// Used amount from an ft_transfer_call result; failed call = nothing moved.
pub(crate) fn used_amount() -> u128 {
    env::promise_result_checked(0, 64)
        .ok()
        .and_then(|b| near_sdk::serde_json::from_slice::<U128>(&b).ok())
        .map_or(0, |u| u.0)
}

impl DeltaVault {
    pub(crate) fn unit(&self, i: usize) -> u128 {
        10u128.pow(self.markets[i].base_decimals as u32)
    }

    /// Oracle floor for swap output: fair value at snapshot price minus slippage_bps.
    pub(crate) fn swap_min_out(&self, i: usize, sell_base: bool, amount_in: u128) -> u128 {
        let (p, unit) = (self.snapshot.prices[i], self.unit(i));
        let fair = if sell_base {
            mul_div(amount_in, p, unit, false)
        } else {
            mul_div(amount_in, unit, p, false)
        };
        mul_div(fair, BPS - self.cfg.slippage_bps as u128, BPS, false)
    }

    pub(crate) fn begin_op(&mut self) {
        self.in_flight += 1;
        self.epoch += 1;
    }

    pub(crate) fn end_op(&mut self) {
        self.in_flight -= 1;
        self.epoch += 1;
    }
}
