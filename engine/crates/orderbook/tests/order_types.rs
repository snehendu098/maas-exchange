mod common;

use common::*;
use orderbook::{Books, CancelReason, RejectReason, StatusKind};
use types::{
    default_markets, AccountId, MarketId, Markets, OrderId, OrderType, Price, Qty, Side,
    TimeInForce,
};

#[test]
fn post_only_rejected_when_crossing() {
    let mut b = book();
    place(&mut b, limit(1, 1, Side::Sell, 1_000, 10));
    let mut o = limit(2, 2, Side::Buy, 1_000, 10);
    o.tif = TimeInForce::PostOnly;
    let ev = place(&mut b, o);
    assert_eq!(
        last_status(&ev, 2),
        StatusKind::Rejected(RejectReason::PostOnlyWouldCross)
    );
    assert!(fills(&ev).is_empty());
    assert_eq!(b.depth(Side::Sell), [(Price(1_000), Qty(10))]);
}

#[test]
fn post_only_rests_when_not_crossing() {
    let mut b = book();
    place(&mut b, limit(1, 1, Side::Sell, 1_000, 10));
    let mut o = limit(2, 2, Side::Buy, 900, 10);
    o.tif = TimeInForce::PostOnly;
    assert_eq!(last_status(&place(&mut b, o), 2), StatusKind::Resting);
}

#[test]
fn ioc_remainder_cancelled() {
    let mut b = book();
    place(&mut b, limit(1, 1, Side::Sell, 1_000, 10));
    let mut o = limit(2, 2, Side::Buy, 1_000, 30);
    o.tif = TimeInForce::Ioc;
    let ev = place(&mut b, o);
    assert_eq!(fill_summary(&ev), [(1, 1_000, 10)]);
    assert_eq!(
        last_status(&ev, 2),
        StatusKind::Cancelled(CancelReason::Unfilled)
    );
    assert!(b.depth(Side::Buy).is_empty());
}

#[test]
fn market_order_sweeps_and_never_rests() {
    let mut b = book();
    place(&mut b, limit(1, 1, Side::Buy, 1_000, 10));
    place(&mut b, limit(2, 1, Side::Buy, 900, 10));
    let ev = place(&mut b, order(3, 2, Side::Sell, None, 30));
    assert_eq!(fill_summary(&ev), [(1, 1_000, 10), (2, 900, 10)]);
    assert_eq!(
        last_status(&ev, 3),
        StatusKind::Cancelled(CancelReason::Unfilled)
    );
    assert!(b.depth(Side::Sell).is_empty());
}

#[test]
fn market_order_respects_price_guard() {
    let mut b = book();
    place(&mut b, limit(1, 1, Side::Sell, 1_000, 10));
    place(&mut b, limit(2, 1, Side::Sell, 1_200, 10));
    let mut o = order(3, 2, Side::Buy, Some(1_100), 20);
    o.kind = OrderType::Market;
    assert_eq!(fill_summary(&place(&mut b, o)), [(1, 1_000, 10)]);
}

fn long_10(who: &AccountId, _: MarketId) -> i128 {
    if *who == acct(1) {
        10
    } else {
        0
    }
}

#[test]
fn reduce_only_cannot_increase() {
    let mut b = book();
    let mut o = limit(1, 1, Side::Buy, 1_000, 10);
    o.reduce_only = true;
    let ev = b.submit(o, &long_10);
    assert_eq!(
        last_status(&ev, 1),
        StatusKind::Rejected(RejectReason::ReduceOnlyWouldIncrease)
    );

    let mut o = limit(2, 2, Side::Sell, 1_000, 10);
    o.reduce_only = true;
    let ev = b.submit(o, &long_10);
    assert_eq!(
        last_status(&ev, 2),
        StatusKind::Rejected(RejectReason::ReduceOnlyWouldIncrease)
    );
}

#[test]
fn reduce_only_clipped_so_it_cannot_flip() {
    let mut b = book();
    place(&mut b, limit(1, 2, Side::Buy, 1_000, 50));
    let mut o = limit(2, 1, Side::Sell, 1_000, 30);
    o.reduce_only = true;
    let ev = b.submit(o, &long_10);
    assert_eq!(fill_summary(&ev), [(1, 1_000, 10)]);
    assert_eq!(last_status(&ev, 2), StatusKind::Filled);
}

#[test]
fn resting_reduce_only_maker_cannot_flip() {
    let mut b = book();
    let mut o = limit(1, 1, Side::Sell, 1_000, 10);
    o.reduce_only = true;
    b.submit(o, &long_10);
    let mut o = limit(2, 1, Side::Sell, 1_000, 10);
    o.reduce_only = true;
    b.submit(o, &long_10);

    // both rest, but only 10 closable in total
    let ev = b.submit(limit(3, 2, Side::Buy, 1_000, 20), &long_10);
    assert_eq!(fill_summary(&ev), [(1, 1_000, 10)]);
    assert_eq!(
        last_status(&ev, 2),
        StatusKind::Cancelled(CancelReason::ReduceOnly)
    );
    assert_eq!(last_status(&ev, 3), StatusKind::Resting);
}

#[test]
fn tick_and_lot_rejected() {
    let mut b = book();
    let cases = [
        (limit(1, 1, Side::Buy, 1_050, 10), RejectReason::InvalidTick),
        (limit(2, 1, Side::Buy, 0, 10), RejectReason::InvalidTick),
        (limit(3, 1, Side::Buy, 1_000, 15), RejectReason::InvalidLot),
        (limit(4, 1, Side::Buy, 1_000, 0), RejectReason::ZeroQty),
    ];
    for (o, reason) in cases {
        let id = o.id.0;
        let ev = place(&mut b, o);
        assert_eq!(last_status(&ev, id), StatusKind::Rejected(reason));
        assert_eq!(ev.len(), 1);
    }
    assert!(b.depth(Side::Buy).is_empty());
}

#[test]
fn other_rejections() {
    let mut b = book();
    let mut o = limit(1, 1, Side::Buy, 1_000, 10);
    o.price = None;
    assert_eq!(
        last_status(&place(&mut b, o), 1),
        StatusKind::Rejected(RejectReason::MissingPrice)
    );

    let mut o = order(2, 1, Side::Buy, None, 10);
    o.tif = TimeInForce::PostOnly;
    assert_eq!(
        last_status(&place(&mut b, o), 2),
        StatusKind::Rejected(RejectReason::InvalidTif)
    );

    let mut o = limit(3, 1, Side::Buy, 1_000, 10);
    o.market = MarketId(99);
    assert_eq!(
        last_status(&place(&mut b, o), 3),
        StatusKind::Rejected(RejectReason::WrongMarket)
    );

    place(&mut b, limit(4, 1, Side::Buy, 1_000, 10));
    assert_eq!(
        last_status(&place(&mut b, limit(4, 1, Side::Buy, 900, 10)), 4),
        StatusKind::Rejected(RejectReason::DuplicateOrderId)
    );
}

#[test]
fn books_route_all_configured_markets() {
    let markets = Markets::new(default_markets()).unwrap();
    let mut books = Books::new(&markets);
    for cfg in markets.iter() {
        let mut o = limit(1, 1, Side::Buy, cfg.tick.0 * 1_000, cfg.lot.0);
        o.market = cfg.id;
        let ev = books.submit(o, &flat);
        assert_eq!(last_status(&ev, 1), StatusKind::Resting, "{}", cfg.symbol);
        assert_eq!(books.get(cfg.id).unwrap().depth(Side::Buy).len(), 1);
    }
    let mut o = limit(2, 1, Side::Buy, 1_000, 10);
    o.market = MarketId(42);
    assert_eq!(
        last_status(&books.submit(o, &flat), 2),
        StatusKind::Rejected(RejectReason::UnknownMarket)
    );
    assert!(books.cancel(MarketId(0), OrderId(1)).is_ok());
}
