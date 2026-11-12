use types::{AccountId, MarketId, Side};

// signed base qty (1e8), long > 0. should include pending fills
pub trait PositionLookup {
    fn position(&self, account: &AccountId, market: MarketId) -> i128;
}

impl<F> PositionLookup for F
where
    F: Fn(&AccountId, MarketId) -> i128,
{
    fn position(&self, account: &AccountId, market: MarketId) -> i128 {
        self(account, market)
    }
}

// qty a reduce-only order on `side` may trade without flipping
pub(crate) fn closable(position: i128, side: Side) -> u128 {
    match side {
        Side::Sell if position > 0 => position.unsigned_abs(),
        Side::Buy if position < 0 => position.unsigned_abs(),
        _ => 0,
    }
}
