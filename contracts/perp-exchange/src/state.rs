use near_sdk::json_types::{I128, U128};
use near_sdk::near;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Market {
    pub tick_size: U128,
    pub lot_size: U128,
    pub max_leverage: u32,
    pub imr_bps: u32,
    pub mmr_bps: u32,
    pub maker_fee_bps: u32,
    pub taker_fee_bps: u32,
}

/// size signed (long > 0), entry_notional = abs USDC cost basis.
#[near(serializers = [borsh])]
#[derive(Clone, Copy, Default, Debug)]
pub struct Position {
    pub size: i128,
    pub entry_notional: u128,
    pub last_funding_index: i128,
}

#[near(serializers = [borsh])]
#[derive(Clone, Copy)]
pub struct PricePoint {
    pub price: u128,
    pub publish_ms: u64,
}

#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
pub struct PositionView {
    pub size: I128,
    pub entry_notional: U128,
    pub last_funding_index: I128,
}

impl From<Position> for PositionView {
    fn from(p: Position) -> Self {
        Self { size: p.size.into(), entry_notional: p.entry_notional.into(), last_funding_index: p.last_funding_index.into() }
    }
}

#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
pub struct Margins {
    pub im: U128,
    pub mm: U128,
}
