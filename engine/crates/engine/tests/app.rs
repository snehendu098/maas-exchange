mod common;

use common::{acct, cancel, engine, fund, limit, settle, BTC, ONE, PX, USDC};
use engine::app::{Cause, ChainUpdate, Command, Output, PlaceOrder};
use orderbook::{CancelError, Event, StatusKind};
use risk::{Position, RiskError};
use types::{OrderId, OrderType, Price, Qty, Side, TimeInForce, TradeId};

// 1 btc @ 60k, imr 5%
const IM_ONE: u128 = 3_000_000_000;

fn fills(out: &[Output]) -> Vec<&orderbook::Fill> {
    out.iter()
        .filter_map(|o| match o {
            Output::Book(Event::Fill(f)) => Some(f),
            _ => None,
        })
        .collect()
}

#[test]
fn crossing_orders_fill_and_track_pending() {
    let mut e = engine();
    e.apply(1, fund(1, 10_000));
    e.apply(2, fund(2, 10_000));
    let rest = e.apply(3, limit(1, Side::Sell, PX, ONE));
    assert!(fills(&rest).is_empty());
    assert_eq!(e.risk().account(&acct(1)).unwrap().reserved_im(), IM_ONE);

    let out = e.apply(4, limit(2, Side::Buy, PX, ONE));
    let f = fills(&out);
    assert_eq!(f.len(), 1);
    assert_eq!(f[0].maker_order, OrderId(3));
    assert_eq!(f[0].taker_order, OrderId(4));
    assert_eq!(f[0].trade_id, TradeId(1));

    for (n, size) in [(1, -(ONE as i128)), (2, ONE as i128)] {
        let a = e.risk().account(&acct(n)).unwrap();
        assert_eq!(a.reserved_im(), 0);
        assert_eq!(a.pending_im(), IM_ONE);
        assert_eq!(a.effective_size(BTC), size);
    }

    e.apply(5, settle(&[1], &[]));
    let a = e.risk().account(&acct(2)).unwrap();
    assert_eq!(a.pending_im(), 0);
    assert_eq!(a.position(BTC).size, ONE as i128);
}

#[test]
fn settle_failed_discards_pending() {
    let mut e = engine();
    e.apply(1, fund(1, 10_000));
    e.apply(2, fund(2, 10_000));
    e.apply(3, limit(1, Side::Sell, PX, ONE));
    e.apply(4, limit(2, Side::Buy, PX, ONE));
    e.apply(5, settle(&[], &[1]));
    for n in [1, 2] {
        let a = e.risk().account(&acct(n)).unwrap();
        assert_eq!(a.pending_im(), 0);
        assert!(a.position(BTC).is_flat());
    }
    // unknown / repeated trade ids ignored
    assert!(e.apply(6, settle(&[1, 99], &[1])).is_empty());
}

#[test]
fn insufficient_margin_rejected_without_touching_book() {
    let mut e = engine();
    e.apply(1, fund(1, 100));
    let out = e.apply(2, limit(1, Side::Buy, PX, ONE));
    let [Output::Rejected(r)] = out.as_slice() else {
        panic!("want rejection, got {out:?}");
    };
    assert!(matches!(
        r.cause,
        Cause::Risk(RiskError::InsufficientMargin { .. })
    ));
    assert_eq!(r.order_id, OrderId(2));
    assert!(e.books().get(BTC).unwrap().best_bid().is_none());
}

#[test]
fn cancel_checks_owner_and_releases() {
    let mut e = engine();
    e.apply(1, fund(1, 10_000));
    e.apply(2, limit(1, Side::Buy, PX, ONE));

    let out = e.apply(3, cancel(2, 2));
    assert!(matches!(
        out.as_slice(),
        [Output::Rejected(r)] if r.cause == Cause::NotOwner
    ));
    let out = e.apply(4, cancel(1, 77));
    assert!(matches!(
        out.as_slice(),
        [Output::Rejected(r)] if r.cause == Cause::Cancel(CancelError::UnknownOrder)
    ));

    let out = e.apply(5, cancel(1, 2));
    assert!(out.iter().any(|o| matches!(
        o,
        Output::Book(Event::Status(s)) if matches!(s.kind, StatusKind::Cancelled(_))
    )));
    assert_eq!(e.risk().account(&acct(1)).unwrap().reserved_im(), 0);
    assert!(e.books().get(BTC).unwrap().best_bid().is_none());
}

#[test]
fn ioc_remainder_and_book_reject_release_reservation() {
    let mut e = engine();
    e.apply(1, fund(1, 10_000));
    e.apply(2, fund(2, 10_000));
    e.apply(3, limit(1, Side::Sell, PX, ONE / 2));
    let ioc = Command::Place(PlaceOrder {
        account: acct(2),
        market: BTC,
        side: Side::Buy,
        kind: OrderType::Limit,
        tif: TimeInForce::Ioc,
        price: Some(Price(PX)),
        qty: Qty(ONE),
        reduce_only: false,
    });
    assert_eq!(fills(&e.apply(4, ioc)).len(), 1);
    assert_eq!(e.risk().account(&acct(2)).unwrap().reserved_im(), 0);

    // bad tick: book rejects after risk reserved -> released
    let out = e.apply(5, limit(2, Side::Buy, PX + 1, ONE));
    assert!(out.iter().any(|o| matches!(
        o,
        Output::Book(Event::Status(s)) if matches!(s.kind, StatusKind::Rejected(_))
    )));
    assert_eq!(e.risk().account(&acct(2)).unwrap().reserved_im(), 0);
}

#[test]
fn market_buy_reserves_at_worst_touched_level() {
    let mut e = engine();
    e.apply(1, fund(1, 1_000_000));
    e.apply(2, fund(2, 4_000));
    e.apply(3, limit(1, Side::Sell, PX, ONE / 2));
    e.apply(4, limit(1, Side::Sell, 2 * PX, ONE));
    let market = |qty| {
        Command::Place(PlaceOrder {
            account: acct(2),
            market: BTC,
            side: Side::Buy,
            kind: OrderType::Market,
            tif: TimeInForce::Ioc,
            price: None,
            qty: Qty(qty),
            reduce_only: false,
        })
    };
    // 1 btc walks to 120k level -> im 6000 > 4000 free
    assert!(matches!(
        e.apply(5, market(ONE)).as_slice(),
        [Output::Rejected(_)]
    ));
    // 0.5 btc stays at 60k -> im 1500
    assert_eq!(fills(&e.apply(6, market(ONE / 2))).len(), 1);
}

#[test]
fn chain_updates_overwrite_risk_view() {
    let mut e = engine();
    e.apply(1, fund(1, 500));
    let pos = Position {
        size: ONE as i128,
        entry_notional: 60_000 * USDC as u128,
    };
    let set = |position| {
        Command::Chain(ChainUpdate::Position {
            account: acct(1),
            market: BTC,
            position,
            block: 0,
        })
    };
    e.apply(2, set(pos));
    e.apply(
        3,
        Command::Chain(ChainUpdate::Mark {
            market: BTC,
            price: Price(PX),
        }),
    );
    let a = e.risk().account(&acct(1)).unwrap();
    assert_eq!(a.collateral(), 500 * USDC);
    assert_eq!(a.position(BTC), pos);
    assert_eq!(e.marks().get(BTC), Some(Price(PX)));
    // collateral 500 < im 3000 at mark -> new order rejected
    assert!(matches!(
        e.apply(4, limit(1, Side::Buy, PX, ONE / 100)).as_slice(),
        [Output::Rejected(_)]
    ));
}

#[test]
fn applied_seq_is_noop() {
    let mut e = engine();
    e.apply(1, fund(1, 10_000));
    assert!(!e.apply(2, limit(1, Side::Buy, PX, ONE)).is_empty());
    assert!(e.apply(2, limit(1, Side::Buy, PX, ONE)).is_empty());
    assert!(e.apply(1, limit(1, Side::Buy, PX, ONE)).is_empty());
    assert_eq!(e.seq(), 2);
    e.skip(3);
    assert_eq!(e.seq(), 3);
}
