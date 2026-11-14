use orderbook::NewOrder;
use risk::Position;
use types::{AccountId, MarketId, OrderId, OrderType, Price, Qty, Side, TimeInForce, TradeId};

// one decoded ENGINE_IN message
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Command {
    Place(PlaceOrder),
    Cancel(CancelOrder),
    Chain(ChainUpdate),
    Settle(SettleResult),
}

// order id assigned by engine = input seq
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PlaceOrder {
    pub account: AccountId,
    pub market: MarketId,
    pub side: Side,
    pub kind: OrderType,
    pub tif: TimeInForce,
    pub price: Option<Price>,
    pub qty: Qty,
    pub reduce_only: bool,
}

impl PlaceOrder {
    pub(crate) fn with_id(self, id: OrderId) -> NewOrder {
        NewOrder {
            id,
            account: self.account,
            market: self.market,
            side: self.side,
            kind: self.kind,
            tif: self.tif,
            price: self.price,
            qty: self.qty,
            reduce_only: self.reduce_only,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CancelOrder {
    pub account: AccountId,
    pub market: MarketId,
    pub order: OrderId,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ChainUpdate {
    Balance {
        account: AccountId,
        collateral: i128,
        block: u64,
    },
    Position {
        account: AccountId,
        market: MarketId,
        position: Position,
        block: u64,
    },
    Mark {
        market: MarketId,
        price: Price,
    },
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SettleResult {
    pub settled: Vec<(MarketId, TradeId)>,
    pub failed: Vec<(MarketId, TradeId)>,
    pub block: u64,
}
