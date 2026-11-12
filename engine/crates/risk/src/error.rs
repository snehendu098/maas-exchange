use types::{MarketId, OrderId, TradeId};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RiskError {
    UnknownMarket(MarketId),
    MissingMark(MarketId),
    DuplicateOrder(OrderId),
    DuplicatePending(MarketId, TradeId),
    UnknownPending(MarketId, TradeId),
    InsufficientMargin { required: u128, free: i128 },
}
