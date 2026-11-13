use orderbook::{CancelError, Event};
use risk::RiskError;
use types::{AccountId, MarketId, OrderId, Qty};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Output {
    Book(Event),
    Rejected(Rejection),
}

// order rejected by risk, or cancel request rejected
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Rejection {
    pub market: MarketId,
    pub order_id: OrderId,
    pub account: AccountId,
    pub cause: Cause,
    pub remaining: Qty,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cause {
    Risk(RiskError),
    Cancel(CancelError),
    NotOwner,
}
