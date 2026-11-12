use types::{AccountId, MarketId, OrderId, Price, Qty, Side, TradeId};

use crate::{CancelReason, RejectReason};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Event {
    Status(OrderStatus),
    Fill(Fill),
    Delta(BookDelta),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Fill {
    pub market: MarketId,
    pub trade_id: TradeId,
    pub price: Price,
    pub qty: Qty,
    pub taker_side: Side,
    pub maker_order: OrderId,
    pub maker_account: AccountId,
    pub taker_order: OrderId,
    pub taker_account: AccountId,
}

// qty = new level total, 0 = level gone
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BookDelta {
    pub market: MarketId,
    pub side: Side,
    pub price: Price,
    pub qty: Qty,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OrderStatus {
    pub market: MarketId,
    pub order_id: OrderId,
    pub account: AccountId,
    pub kind: StatusKind,
    pub filled: Qty,
    pub remaining: Qty,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StatusKind {
    Accepted,
    Rejected(RejectReason),
    Resting,
    PartiallyFilled,
    Filled,
    Cancelled(CancelReason),
}
