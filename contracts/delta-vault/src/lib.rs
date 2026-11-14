//! Delta-neutral USDC vault: long spot at Ref Finance + equal perp short on markets 0..2.
//! NAV = idle + ref_usdc + spot (snapshot prices) + perp equity (snapshot). Fee on withdraw only.
use near_contract_standards::fungible_token::metadata::{FungibleTokenMetadata, FT_METADATA_SPEC};
use near_contract_standards::fungible_token::FungibleToken;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, BorshStorageKey, PanicOnDefault};

mod admin;
mod events;
mod ext;
mod ft_receiver;
mod margin;
mod mode;
mod redeem;
mod shares;
mod spot;
mod state;
mod sync;
#[cfg(test)]
mod tests;
mod views;

pub use state::*;

pub const N: usize = 3;
pub const BPS: u128 = 10_000;

#[near]
#[derive(BorshStorageKey)]
enum Key {
    Shares,
    Requests,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct DeltaVault {
    owner: AccountId,
    keeper: AccountId,
    usdc: AccountId,
    exchange: AccountId,
    ref_exchange: AccountId,
    token: FungibleToken,
    cfg: Config,
    markets: [VaultMarket; N],
    mode: [Mode; N],
    last_mode_change_ms: [u64; N],
    /// USDC held by vault (tracked, plain transfers in are ignored).
    idle: u128,
    /// USDC and base (raw units) held as internal deposits at Ref.
    ref_usdc: u128,
    spot: [u128; N],
    snapshot: Snapshot,
    /// Bumped on every margin/spot move; a sync started before a bump is discarded.
    epoch: u64,
    in_flight: u32,
    requests: LookupMap<u64, WithdrawRequest>,
    next_request_id: u64,
    total_queued_shares: u128,
}

#[near]
impl DeltaVault {
    #[init]
    pub fn new(
        owner: AccountId,
        keeper: AccountId,
        usdc: AccountId,
        exchange: AccountId,
        ref_exchange: AccountId,
        markets: [VaultMarket; N],
        config: Config,
    ) -> Self {
        admin::validate(&config);
        let mut v = Self {
            owner,
            keeper,
            usdc,
            exchange,
            ref_exchange,
            token: FungibleToken::new(Key::Shares),
            cfg: config,
            markets,
            mode: [Mode::Flat; N],
            last_mode_change_ms: [0; N],
            idle: 0,
            ref_usdc: 0,
            spot: [0; N],
            snapshot: Snapshot::default(),
            epoch: 0,
            in_flight: 0,
            requests: LookupMap::new(Key::Requests),
            next_request_id: 1,
            total_queued_shares: 0,
        };
        v.token
            .internal_register_account(&env::current_account_id());
        v
    }
}

pub fn metadata() -> FungibleTokenMetadata {
    FungibleTokenMetadata {
        spec: FT_METADATA_SPEC.to_string(),
        name: "MaaS Delta Neutral USDC".to_string(),
        symbol: "mxUSDC".to_string(),
        icon: None,
        reference: None,
        reference_hash: None,
        decimals: 6,
    }
}

impl DeltaVault {
    fn assert_role(&self, who: &AccountId, name: &str) {
        assert_eq!(&env::predecessor_account_id(), who, "not {name}");
    }
}
