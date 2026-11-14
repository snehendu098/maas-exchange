use near_sdk::json_types::{I128, U128};
use near_sdk::{near, AccountId};
use perp_math::{mul_div, SIZE_UNIT};

use crate::{
    Config, DeltaVault, DeltaVaultExt, Mode, SnapshotView, VaultMarket, WithdrawRequest, N,
};

#[near]
impl DeltaVault {
    pub fn config(&self) -> Config {
        self.cfg.clone()
    }

    pub fn mode(&self, market: u32) -> Mode {
        self.mode[market as usize]
    }

    pub fn last_mode_change_ms(&self, market: u32) -> u64 {
        self.last_mode_change_ms[market as usize]
    }

    /// From the cached snapshot; check `snapshot().at_ms` for freshness.
    pub fn nav(&self) -> U128 {
        self.nav_of().into()
    }

    pub fn spot_value(&self) -> U128 {
        self.spot_value_of().into()
    }

    pub fn perp_equity(&self) -> I128 {
        self.snapshot.perp_equity.into()
    }

    /// Spot held in perp size units (1e8).
    pub fn spot_size(&self, market: u32) -> U128 {
        let i = market as usize;
        mul_div(
            self.spot[i],
            SIZE_UNIT,
            10u128.pow(self.markets[i].base_decimals as u32),
            false,
        )
        .into()
    }

    pub fn requests(&self, id: u64) -> Option<WithdrawRequest> {
        self.requests.get(&id).cloned()
    }

    pub fn next_request_id(&self) -> u64 {
        self.next_request_id
    }

    pub fn total_queued_shares(&self) -> U128 {
        self.total_queued_shares.into()
    }

    pub fn idle(&self) -> U128 {
        self.idle.into()
    }

    pub fn ref_usdc(&self) -> U128 {
        self.ref_usdc.into()
    }

    pub fn markets(&self) -> [VaultMarket; N] {
        self.markets.clone()
    }

    pub fn snapshot(&self) -> SnapshotView {
        let s = &self.snapshot;
        SnapshotView {
            perp_equity: s.perp_equity.into(),
            prices: s.prices.map(U128),
            sizes: s.sizes.map(I128),
            at_ms: s.at_ms,
        }
    }

    pub fn keeper(&self) -> AccountId {
        self.keeper.clone()
    }

    pub fn exchange(&self) -> AccountId {
        self.exchange.clone()
    }
}
