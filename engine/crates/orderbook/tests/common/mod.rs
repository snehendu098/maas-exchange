#![allow(dead_code)]

use orderbook::{Event, Fill, NewOrder, OrderBook, StatusKind};
use types::{AccountId, MarketConfig, MarketId, OrderId, OrderType, Price, Qty, Side, TimeInForce};

pub const MKT: MarketId = MarketId(7);

pub fn book() -> OrderBook {
    OrderBook::new(MarketConfig {
        id: MKT,
        symbol: "TEST".into(),
        tick: Price(100),
        lot: Qty(10),
        imr_bps: 1_000,
        mmr_bps: 500,
    })
}

pub fn acct(n: u8) -> AccountId {
    AccountId::new(&format!("t{n}.testnet")).unwrap()
}

pub fn flat(_: &AccountId, _: MarketId) -> i128 {
    0
}

pub fn order(id: u64, who: u8, side: Side, price: Option<u64>, qty: u64) -> NewOrder {
    NewOrder {
        id: OrderId(id),
        account: acct(who),
        market: MKT,
        side,
        kind: if price.is_some() {
            OrderType::Limit
        } else {
            OrderType::Market
        },
        tif: TimeInForce::Gtc,
        price: price.map(Price),
        qty: Qty(qty),
        reduce_only: false,
    }
}

pub fn limit(id: u64, who: u8, side: Side, price: u64, qty: u64) -> NewOrder {
    order(id, who, side, Some(price), qty)
}

pub fn place(book: &mut OrderBook, o: NewOrder) -> Vec<Event> {
    book.submit(o, &flat)
}

pub fn fills(events: &[Event]) -> Vec<Fill> {
    events
        .iter()
        .filter_map(|e| match e {
            Event::Fill(f) => Some(f.clone()),
            _ => None,
        })
        .collect()
}

// (maker order, price, qty) per fill
pub fn fill_summary(events: &[Event]) -> Vec<(u64, u64, u64)> {
    fills(events)
        .iter()
        .map(|f| (f.maker_order.0, f.price.0, f.qty.0))
        .collect()
}

pub fn last_status(events: &[Event], id: u64) -> StatusKind {
    events
        .iter()
        .rev()
        .find_map(|e| match e {
            Event::Status(s) if s.order_id == OrderId(id) => Some(s.kind),
            _ => None,
        })
        .expect("status for order")
}
