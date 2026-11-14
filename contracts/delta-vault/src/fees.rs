use near_contract_standards::fungible_token::core::ext_ft_core;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, Gas, NearToken, Promise};
use perp_math::mul_div;

use crate::events::emit;
use crate::spot::used_amount;
use crate::{DeltaVault, DeltaVaultExt, BPS, N};

const GAS_FT_CALL: Gas = Gas::from_tgas(40);
const GAS_FT: Gas = Gas::from_tgas(10);
const GAS_CB: Gas = Gas::from_tgas(10);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[near]
impl DeltaVault {
    /// Keeper: pays accrued withdraw fees. LP half streams to each pool's LPs by market weight
    /// (`ft_transfer_call(pool, {"reward": id})`), treasury half goes to owner.
    pub fn pay_fees(&mut self) -> Option<Promise> {
        self.assert_role(&self.keeper.clone(), "keeper");
        let me = env::current_account_id();
        let (lp, tr) = (self.lp_accrued, self.treasury_accrued);
        let mut all: Option<Promise> = None;
        let mut join = |p: Promise| {
            all = Some(match all.take() {
                Some(a) => a.and(p),
                None => p,
            })
        };
        let mut sent = 0;
        for i in 0..N {
            // last market with weight takes the rounding rest
            let w = self.cfg.weights_bps[i] as u128;
            let amt = if (i + 1..N).all(|j| self.cfg.weights_bps[j] == 0) {
                lp - sent
            } else {
                mul_div(lp, w, BPS, false)
            };
            if amt == 0 {
                continue;
            }
            sent += amt;
            let pool = self.markets[i].ref_pool_id;
            join(
                ext_ft_core::ext(self.usdc.clone())
                    .with_attached_deposit(ONE_YOCTO)
                    .with_static_gas(GAS_FT_CALL)
                    .ft_transfer_call(
                        self.ref_exchange.clone(),
                        U128(amt),
                        None,
                        json!({"reward": pool}).to_string(),
                    )
                    .then(
                        Self::ext(me.clone())
                            .with_static_gas(GAS_CB)
                            .on_lp_reward(U128(amt)),
                    ),
            );
        }
        if tr > 0 {
            join(
                ext_ft_core::ext(self.usdc.clone())
                    .with_attached_deposit(ONE_YOCTO)
                    .with_static_gas(GAS_FT)
                    .ft_transfer(self.owner.clone(), U128(tr), None)
                    .then(Self::ext(me).with_static_gas(GAS_CB).on_treasury(U128(tr))),
            );
        }
        self.idle -= sent + tr;
        self.lp_accrued -= sent;
        self.treasury_accrued = 0;
        all
    }

    /// Unused reward (failed call) goes back to accrued.
    #[private]
    pub fn on_lp_reward(&mut self, amount: U128) -> U128 {
        let used = used_amount();
        let back = amount.0 - used;
        self.idle += back;
        self.lp_accrued += back;
        emit("lp_reward_paid", json!({"amount": U128(used)}));
        U128(used)
    }

    #[private]
    pub fn on_treasury(&mut self, amount: U128) -> bool {
        let ok = env::promise_result_checked(0, 0).is_ok();
        if !ok {
            self.idle += amount.0;
            self.treasury_accrued += amount.0;
        }
        ok
    }

    pub fn accrued_fees(&self) -> [U128; 2] {
        [U128(self.lp_accrued), U128(self.treasury_accrued)]
    }
}

impl DeltaVault {
    pub(crate) fn accrued(&self) -> u128 {
        self.lp_accrued + self.treasury_accrued
    }

    /// Redeem `shares` at NAV: returns assets net of fee and books the fee 50/50 (LP / treasury).
    // ponytail: if the payout transfer then fails, shares are re-minted but the fee stays booked
    pub(crate) fn charge(&mut self, shares: u128, nav: u128) -> u128 {
        let gross = self.to_assets(shares, nav, false);
        let assets = self.preview_redeem(shares, nav);
        let fee = gross - assets;
        let lp = fee / 2;
        self.lp_accrued += lp;
        self.treasury_accrued += fee - lp;
        assets
    }
}
