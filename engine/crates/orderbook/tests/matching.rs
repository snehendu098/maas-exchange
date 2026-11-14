mod common;

use common::*;
use orderbook::{BookDelta, CancelError, CancelReason, Event, OrderStatus, StatusKind};
use types::{OrderId, Price, Qty, Side, TradeId};

#[test]
fn better_price_matches_first() {
    let mut b = book();
    place(&mut b, limit(1, 1, Side::Sell, 1_100, 10));
    place(&mut b, limit(2, 2, Side::Sell, 1_000, 10));
    let ev = place(&mut b, limit(3, 3, Side::Buy, 1_100, 10));
    assert_eq!(fill_summary(&ev), [(2, 1_000, 10)]);
    assert_eq!(b.best_ask(), Some(Price(1_100)));
}

#[test]
fn earlier_order_at_same_price_matches_first() {
    let mut b = book();
    place(&mut b, limit(1, 1, Side::Buy, 1_000, 10));
    place(&mut b, limit(2, 2, Side::Buy, 1_000, 10));
    let ev = place(&mut b, limit(3, 3, Side::Sell, 1_000, 10));
    assert_eq!(fill_summary(&ev), [(1, 1_000, 10)]);
    assert!(b.contains(OrderId(2)));
    assert!(!b.contains(OrderId(1)));
}

#[test]
fn partial_fill_of_maker_keeps_rest() {
    let mut b = book();
    place(&mut b, limit(1, 1, Side::Sell, 1_000, 50));
    let ev = place(&mut b, limit(2, 2, Side::Buy, 1_000, 20));
    assert_eq!(fill_summary(&ev), [(1, 1_000, 20)]);
    assert_eq!(last_status(&ev, 1), StatusKind::PartiallyFilled);
    assert_eq!(last_status(&ev, 2), StatusKind::Filled);
    let maker = b.order(OrderId(1)).unwrap();
    assert_eq!((maker.remaining, maker.filled), (Qty(30), Qty(20)));
}

#[test]
fn partial_fill_of_taker_rests_remainder() {
    let mut b = book();
    place(&mut b, limit(1, 1, Side::Sell, 1_000, 20));
    let ev = place(&mut b, limit(2, 2, Side::Buy, 1_000, 50));
    assert_eq!(last_status(&ev, 2), StatusKind::Resting);
    assert_eq!(b.depth(Side::Buy), [(Price(1_000), Qty(30))]);
    assert_eq!(b.order(OrderId(2)).unwrap().filled, Qty(20));
}

#[test]
fn sweep_multiple_levels_at_maker_prices() {
    let mut b = book();
    place(&mut b, limit(1, 1, Side::Sell, 1_000, 10));
    place(&mut b, limit(2, 1, Side::Sell, 1_100, 10));
    place(&mut b, limit(3, 2, Side::Sell, 1_200, 20));
    place(&mut b, limit(4, 2, Side::Sell, 1_300, 10));
    let ev = place(&mut b, limit(5, 3, Side::Buy, 1_200, 30));
    assert_eq!(
        fill_summary(&ev),
        [(1, 1_000, 10), (2, 1_100, 10), (3, 1_200, 10)]
    );
    assert_eq!(
        b.depth(Side::Sell),
        [(Price(1_200), Qty(10)), (Price(1_300), Qty(10))]
    );
    assert_eq!(last_status(&ev, 5), StatusKind::Filled);
}

#[test]
fn execution_uses_maker_price_not_taker_limit() {
    let mut b = book();
    place(&mut b, limit(1, 1, Side::Buy, 1_500, 10));
    let ev = place(&mut b, limit(2, 2, Side::Sell, 1_000, 10));
    let f = &fills(&ev)[0];
    assert_eq!(f.price, Price(1_500));
    assert_eq!(f.taker_side, Side::Sell);
    assert_eq!(f.trade_id, TradeId(1));
}

#[test]
fn self_trade_cancels_taker_remainder() {
    let mut b = book();
    place(&mut b, limit(1, 2, Side::Sell, 1_000, 10));
    place(&mut b, limit(2, 1, Side::Sell, 1_100, 10));
    place(&mut b, limit(3, 2, Side::Sell, 1_200, 10));
    let ev = place(&mut b, limit(4, 1, Side::Buy, 1_200, 30));
    assert_eq!(fill_summary(&ev), [(1, 1_000, 10)]);
    assert_eq!(
        last_status(&ev, 4),
        StatusKind::Cancelled(CancelReason::SelfTrade)
    );
    assert!(b.contains(OrderId(2)), "own maker untouched");
    assert!(!b.contains(OrderId(4)), "taker not rested");
}

#[test]
fn cancel_by_id_emits_delta_and_status() {
    let mut b = book();
    place(&mut b, limit(1, 1, Side::Buy, 1_000, 10));
    place(&mut b, limit(2, 2, Side::Buy, 1_000, 20));
    let ev = b.cancel(OrderId(1)).unwrap();
    assert_eq!(
        ev,
        [
            Event::Delta(BookDelta {
                market: MKT,
                side: Side::Buy,
                price: Price(1_000),
                qty: Qty(20),
            }),
            Event::Status(OrderStatus {
                market: MKT,
                order_id: OrderId(1),
                account: acct(1),
                kind: StatusKind::Cancelled(CancelReason::User),
                filled: Qty::ZERO,
                remaining: Qty(10),
            }),
        ]
    );
    assert_eq!(b.cancel(OrderId(1)), Err(CancelError::UnknownOrder));
}

#[test]
fn deltas_track_level_totals() {
    let mut b = book();
    let ev = place(&mut b, limit(1, 1, Side::Sell, 1_000, 30));
    assert!(ev.contains(&Event::Delta(BookDelta {
        market: MKT,
        side: Side::Sell,
        price: Price(1_000),
        qty: Qty(30),
    })));
    let ev = place(&mut b, limit(2, 2, Side::Buy, 1_000, 30));
    assert!(ev.contains(&Event::Delta(BookDelta {
        market: MKT,
        side: Side::Sell,
        price: Price(1_000),
        qty: Qty::ZERO,
    })));
    assert!(b.depth(Side::Sell).is_empty());
}

#[test]
fn same_input_sequence_same_output() {
    let run = || {
        let mut b = book();
        let mut out = Vec::new();
        for i in 0..200u64 {
            let side = if (i * 7) % 3 == 0 {
                Side::Buy
            } else {
                Side::Sell
            };
            let price = 1_000 + ((i * 37) % 11) * 100;
            let qty = 10 + ((i * 13) % 7) * 10;
            let who = (i % 5) as u8;
            out.extend(place(&mut b, limit(i, who, side, price, qty)));
            if i % 9 == 0 {
                out.extend(b.cancel(OrderId(i / 2)).unwrap_or_default());
            }
        }
        (out, b.depth(Side::Buy), b.depth(Side::Sell))
    };
    let (a, b) = (run(), run());
    assert!(!fills(&a.0).is_empty());
    assert_eq!(a, b);
}
