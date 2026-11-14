use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::events::{FtBurn, FtMint};
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider,
};
use near_contract_standards::fungible_token::resolver::FungibleTokenResolver;
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, NearToken, PromiseOrValue};
use perp_math::mul_div;

use crate::{metadata, DeltaVault, DeltaVaultExt, BPS, N};

#[near]
impl FungibleTokenCore for DeltaVault {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for DeltaVault {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, burned) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        if burned > 0 {
            FtBurn {
                owner_id: &sender_id,
                amount: U128(burned),
                memo: None,
            }
            .emit();
        }
        used.into()
    }
}

#[near]
impl StorageManagement for DeltaVault {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.internal_storage_unregister(force).is_some()
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for DeltaVault {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        metadata()
    }
}

impl DeltaVault {
    pub(crate) fn spot_value_of(&self) -> u128 {
        (0..N)
            .filter(|&i| self.spot[i] != 0)
            .map(|i| {
                mul_div(
                    self.spot[i],
                    self.snapshot.prices[i],
                    10u128.pow(self.markets[i].base_decimals as u32),
                    false,
                )
            })
            .sum()
    }

    /// idle + ref_usdc + spot + perp equity, floored at 0. Uses cached snapshot.
    pub(crate) fn nav_of(&self) -> u128 {
        let nav = perp_math::to_i128(self.idle + self.ref_usdc + self.spot_value_of())
            - perp_math::to_i128(self.accrued())
            + self.snapshot.perp_equity;
        nav.max(0) as u128
    }

    /// Snapshot must be recent and no margin move in flight; returns NAV.
    pub(crate) fn fresh_nav(&self) -> u128 {
        let s = &self.snapshot;
        assert!(
            s.at_ms != 0 && env::block_timestamp_ms() <= s.at_ms + self.cfg.max_price_age_ms,
            "stale snapshot"
        );
        assert!(self.in_flight == 0, "op in flight");
        self.nav_of()
    }

    /// Virtual 1 share / 1 asset offset keeps empty vault priced at 1:1.
    pub(crate) fn to_shares(&self, assets: u128, nav: u128) -> u128 {
        mul_div(assets, self.token.total_supply + 1, nav + 1, false)
    }

    pub(crate) fn to_assets(&self, shares: u128, nav: u128, round_up: bool) -> u128 {
        mul_div(shares, nav + 1, self.token.total_supply + 1, round_up)
    }

    /// Assets paid for `shares`, net of withdraw fee (fee stays in vault).
    pub(crate) fn preview_redeem(&self, shares: u128, nav: u128) -> u128 {
        let gross = self.to_assets(shares, nav, false);
        gross - mul_div(gross, self.cfg.withdraw_fee_bps as u128, BPS, true)
    }

    /// Idle USDC not reserved for queued shares.
    pub(crate) fn available(&self, nav: u128) -> u128 {
        self.idle
            .saturating_sub(self.accrued())
            .saturating_sub(self.to_assets(self.total_queued_shares, nav, true))
    }

    pub(crate) fn mint(&mut self, a: &AccountId, shares: u128) {
        if !self.token.accounts.contains_key(a) {
            self.token.internal_register_account(a);
        }
        self.token.internal_deposit(a, shares);
        FtMint {
            owner_id: a,
            amount: U128(shares),
            memo: None,
        }
        .emit();
    }

    pub(crate) fn burn(&mut self, a: &AccountId, shares: u128) {
        self.token.internal_withdraw(a, shares);
        FtBurn {
            owner_id: a,
            amount: U128(shares),
            memo: None,
        }
        .emit();
    }
}
