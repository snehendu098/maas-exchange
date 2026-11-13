use types::{AccountId, MarketId, OrderId, OrderType, Price, Qty, Side, TimeInForce};

// market order: price = optional worst-price guard
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NewOrder {
    pub id: OrderId,
    pub account: AccountId,
    pub market: MarketId,
    pub side: Side,
    pub kind: OrderType,
    pub tif: TimeInForce,
    pub price: Option<Price>,
    pub qty: Qty,
    pub reduce_only: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct RestingOrder {
    pub id: OrderId,
    pub account: AccountId,
    pub side: Side,
    pub price: Price,
    pub remaining: Qty,
    pub filled: Qty,
    pub reduce_only: bool,
}
