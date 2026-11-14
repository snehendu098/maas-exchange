use near_sdk::json_types::{I128, U128};
use near_sdk::{near, AccountId};

use crate::N;

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Mode {
    Flat,
    Hedged,
}

/// shortLeverage + idleBuffer are keeper hints; rest enforced onchain.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Config {
    pub weights_bps: [u32; N],
    pub short_leverage_bps: u32,
    pub idle_buffer_bps: u32,
    pub withdraw_fee_bps: u32,
    pub cooldown_ms: u64,
    pub price_band_bps: u32,
    pub slippage_bps: u32,
    pub size_cap: [U128; N],
    pub max_price_age_ms: u64,
}

/// Spot leg for perp market i: base token + Ref pool vs USDC.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct VaultMarket {
    pub base_token: AccountId,
    pub base_decimals: u8,
    pub ref_pool_id: u64,
}

/// Exchange state cached by `sync`.
#[near(serializers = [borsh])]
#[derive(Clone, Default)]
pub struct Snapshot {
    pub perp_equity: i128,
    pub prices: [u128; N],
    pub sizes: [i128; N],
    pub at_ms: u64,
}

#[near(serializers = [json])]
pub struct SnapshotView {
    pub perp_equity: I128,
    pub prices: [U128; N],
    pub sizes: [I128; N],
    pub at_ms: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct WithdrawRequest {
    pub owner: AccountId,
    pub shares: U128,
}

#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
pub struct RedeemResult {
    /// None = fully paid instantly.
    pub id: Option<u64>,
    pub assets: U128,
}
