//! Cross-margin perp settlement for offchain-matched signed orders. Keeper-pushed prices.
//! Liquidated positions move to `insurance` at mark, so sum of sizes per market stays 0.
use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{env, near, AccountId, BorshStorageKey, CryptoHash, PanicOnDefault, PublicKey};

mod admin;
mod collateral;
mod events;
mod ft_receiver;
mod funding;
mod keys;
mod liquidation;
mod margin;
mod orders;
mod prices;
mod settle;
mod state;
mod views;
#[cfg(test)]
mod tests;

pub use orders::{Fill, Order};
pub use state::*;

pub const MAX_MARKETS: u32 = 4;

#[near]
#[derive(BorshStorageKey)]
enum Key {
    Markets,
    Collateral,
    Positions,
    FundingIndex,
    Filled,
    Cancelled,
    FeeExempt,
    TradingKeys,
    Prices,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct PerpExchange {
    owner: AccountId,
    operator: AccountId,
    keeper: AccountId,
    fee_recipient: AccountId,
    insurance: AccountId,
    usdc: AccountId,
    max_price_age_ms: u64,
    markets: LookupMap<u32, Market>,
    collateral: LookupMap<AccountId, i128>,
    positions: LookupMap<(AccountId, u32), Position>,
    funding_index: LookupMap<u32, i128>,
    /// Funding rounding remainder in 1/FUNDING_UNIT wei; whole wei swept to insurance.
    funding_dust: u128,
    filled: LookupMap<CryptoHash, u128>,
    cancelled: LookupSet<CryptoHash>,
    fee_exempt: LookupSet<AccountId>,
    trading_keys: LookupMap<AccountId, Vec<PublicKey>>,
    prices: LookupMap<u32, PricePoint>,
}

#[near]
impl PerpExchange {
    #[init]
    pub fn new(
        owner: AccountId,
        operator: AccountId,
        keeper: AccountId,
        fee_recipient: AccountId,
        insurance: AccountId,
        usdc: AccountId,
        max_price_age_ms: u64,
    ) -> Self {
        Self {
            owner,
            operator,
            keeper,
            fee_recipient,
            insurance,
            usdc,
            max_price_age_ms,
            markets: LookupMap::new(Key::Markets),
            collateral: LookupMap::new(Key::Collateral),
            positions: LookupMap::new(Key::Positions),
            funding_index: LookupMap::new(Key::FundingIndex),
            funding_dust: 0,
            filled: LookupMap::new(Key::Filled),
            cancelled: LookupSet::new(Key::Cancelled),
            fee_exempt: LookupSet::new(Key::FeeExempt),
            trading_keys: LookupMap::new(Key::TradingKeys),
            prices: LookupMap::new(Key::Prices),
        }
    }
}

impl PerpExchange {
    fn assert_role(&self, who: &AccountId, name: &str) {
        assert_eq!(&env::predecessor_account_id(), who, "not {name}");
    }

    fn mkt(&self, market_id: u32) -> Market {
        self.markets.get(&market_id).cloned().expect("unknown market")
    }

    fn coll(&self, a: &AccountId) -> i128 {
        self.collateral.get(a).copied().unwrap_or(0)
    }

    /// Adds delta to collateral, returns new value.
    fn add_coll(&mut self, a: &AccountId, delta: i128) -> i128 {
        let c = self.coll(a) + delta;
        self.collateral.insert(a.clone(), c);
        c
    }

    fn pos(&self, a: &AccountId, market_id: u32) -> Position {
        self.positions.get(&(a.clone(), market_id)).copied().unwrap_or_default()
    }

    fn findex(&self, market_id: u32) -> i128 {
        self.funding_index.get(&market_id).copied().unwrap_or(0)
    }
}
