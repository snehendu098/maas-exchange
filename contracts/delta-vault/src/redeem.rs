use near_contract_standards::fungible_token::core::{ext_ft_core, FungibleTokenCore};
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{assert_one_yocto, env, near, AccountId, Gas, NearToken, PromiseError};

use crate::events::emit;
use crate::{DeltaVault, DeltaVaultExt, RedeemResult, WithdrawRequest};

const GAS_FT: Gas = Gas::from_tgas(10);
const GAS_CB: Gas = Gas::from_tgas(10);

#[near]
impl DeltaVault {
    /// Instant part paid from unreserved idle now, rest escrowed + queued. id 0 = nothing queued.
    #[payable]
    pub fn request_redeem(&mut self, shares: U128) -> RedeemResult {
        assert_one_yocto();
        let a = env::predecessor_account_id();
        let shares = shares.0;
        assert!(
            shares > 0 && shares <= self.token.ft_balance_of(a.clone()).0,
            "bad amount"
        );
        let nav = self.fresh_nav();
        let avail = self.available(nav);
        let instant = if self.to_assets(shares, nav, false) <= avail {
            shares
        } else {
            self.to_shares(avail, nav).min(shares)
        };
        let mut assets = 0;
        if instant != 0 {
            assets = self.preview_redeem(instant, nav);
            self.burn(&a, instant);
            self.payout(a.clone(), instant, assets);
        }
        let rest = shares - instant;
        if rest == 0 {
            return RedeemResult {
                id: 0,
                assets: assets.into(),
            };
        }
        self.token
            .internal_transfer(&a, &env::current_account_id(), rest, None);
        let id = self.next_request_id;
        self.next_request_id += 1;
        self.requests.insert(
            id,
            WithdrawRequest {
                owner: a.clone(),
                shares: rest.into(),
            },
        );
        self.total_queued_shares += rest;
        emit(
            "withdraw_queued",
            json!({"id": id, "owner": a, "shares": rest.to_string()}),
        );
        RedeemResult {
            id,
            assets: assets.into(),
        }
    }

    /// Owner pulls a queued request; escrowed shares returned.
    pub fn cancel_request(&mut self, id: u64) {
        let r = self.requests.remove(&id).expect("unknown request");
        assert_eq!(env::predecessor_account_id(), r.owner, "not request owner");
        self.total_queued_shares -= r.shares.0;
        self.token
            .internal_transfer(&env::current_account_id(), &r.owner, r.shares.0, None);
        emit(
            "withdraw_cancelled",
            json!({"id": id, "owner": r.owner, "shares": r.shares}),
        );
    }

    /// Keeper pays a queued request at current NAV, net of withdraw fee.
    pub fn fulfill(&mut self, id: u64) -> U128 {
        self.assert_role(&self.keeper.clone(), "keeper");
        let nav = self.fresh_nav();
        let r = self.requests.remove(&id).expect("unknown request");
        let assets = self.preview_redeem(r.shares.0, nav);
        assert!(assets <= self.idle, "insufficient idle");
        self.total_queued_shares -= r.shares.0;
        self.burn(&env::current_account_id(), r.shares.0);
        self.payout(r.owner.clone(), r.shares.0, assets);
        emit(
            "withdraw_fulfilled",
            json!({"id": id, "owner": r.owner, "shares": r.shares, "assets": assets.to_string()}),
        );
        assets.into()
    }

    /// Failed USDC transfer: restore idle and re-mint burned shares.
    #[private]
    pub fn on_payout(
        &mut self,
        owner: AccountId,
        shares: U128,
        assets: U128,
        #[callback_result] res: Result<(), PromiseError>,
    ) -> bool {
        if res.is_ok() {
            return true;
        }
        self.idle += assets.0;
        self.mint(&owner, shares.0);
        false
    }
}

impl DeltaVault {
    fn payout(&mut self, to: AccountId, shares: u128, assets: u128) {
        self.idle -= assets;
        if assets == 0 {
            return;
        }
        let _ = ext_ft_core::ext(self.usdc.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT)
            .ft_transfer(to.clone(), assets.into(), None)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CB)
                    .on_payout(to, shares.into(), assets.into()),
            );
    }
}
