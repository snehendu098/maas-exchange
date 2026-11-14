use risk::{FillLeg, Marks, OrderIntent, Position, RiskEngine, RiskError};
use types::{default_markets, AccountId, MarketId, Markets, OrderId, Price, Qty, Side, TradeId};

const BTC: MarketId = MarketId(0);
const ONE: u64 = 100_000_000;
// 10k usdc per btc
const PX: Price = Price(10_000_000_000);
// 1 btc @ 10k, imr 5% = 500 usdc
const IM_ONE: u128 = 500_000_000;
const USDC: i128 = 1_000_000;

fn who() -> AccountId {
    AccountId::new("t9.testnet").unwrap()
}

fn setup(collateral: i128) -> (RiskEngine, Marks) {
    let mut eng = RiskEngine::new(Markets::new(default_markets()).unwrap());
    eng.set_collateral(who(), collateral, 0);
    let marks = [(BTC, PX)].into_iter().collect();
    (eng, marks)
}

fn intent(id: u64, side: Side, qty: u64) -> OrderIntent {
    OrderIntent {
        id: OrderId(id),
        market: BTC,
        side,
        price: PX,
        qty: Qty(qty),
        reduce_only: false,
    }
}

fn leg(order: u64, trade: u64, side: Side, qty: u64) -> FillLeg {
    FillLeg {
        order: OrderId(order),
        market: BTC,
        trade_id: TradeId(trade),
        side,
        price: PX,
        qty: Qty(qty),
    }
}

#[test]
fn reserve_on_rest_reduces_free_margin() {
    let (mut eng, marks) = setup(1_000 * USDC);
    let im = eng
        .check_and_reserve(who(), &intent(1, Side::Buy, ONE), &marks)
        .unwrap();
    assert_eq!(im, IM_ONE);
    assert_eq!(eng.free_margin(&who(), &marks).unwrap(), 500 * USDC);
    assert_eq!(eng.account(&who()).unwrap().reserved_im(), IM_ONE);
}

#[test]
fn reject_when_insufficient() {
    let (mut eng, marks) = setup(1_000 * USDC);
    eng.check_and_reserve(who(), &intent(1, Side::Buy, ONE), &marks)
        .unwrap();
    eng.check_and_reserve(who(), &intent(2, Side::Sell, ONE), &marks)
        .unwrap();
    let err = eng
        .check_and_reserve(who(), &intent(3, Side::Buy, ONE / 100), &marks)
        .unwrap_err();
    assert_eq!(
        err,
        RiskError::InsufficientMargin {
            required: 5_000_000,
            free: 0
        }
    );
    assert!(eng
        .account(&who())
        .unwrap()
        .reservation(OrderId(3))
        .is_none());
}

#[test]
fn release_on_cancel() {
    let (mut eng, marks) = setup(1_000 * USDC);
    eng.check_and_reserve(who(), &intent(1, Side::Buy, ONE), &marks)
        .unwrap();
    assert_eq!(eng.release(&who(), OrderId(1)), IM_ONE);
    assert_eq!(eng.release(&who(), OrderId(1)), 0);
    assert_eq!(eng.free_margin(&who(), &marks).unwrap(), 1_000 * USDC);
}

#[test]
fn partial_fill_moves_reservation_to_pending() {
    let (mut eng, marks) = setup(1_000 * USDC);
    eng.check_and_reserve(who(), &intent(1, Side::Buy, ONE), &marks)
        .unwrap();
    eng.on_fill(who(), &leg(1, 1, Side::Buy, ONE / 4)).unwrap();
    let acct = eng.account(&who()).unwrap();
    assert_eq!(acct.reserved_im(), IM_ONE * 3 / 4);
    assert_eq!(acct.pending_im(), IM_ONE / 4);
    assert_eq!(acct.effective_size(BTC), (ONE / 4) as i128);
    assert_eq!(eng.free_margin(&who(), &marks).unwrap(), 500 * USDC);
}

#[test]
fn full_fill_releases_reservation_then_settles() {
    let (mut eng, marks) = setup(1_000 * USDC);
    eng.check_and_reserve(who(), &intent(1, Side::Buy, ONE), &marks)
        .unwrap();
    eng.on_fill(who(), &leg(1, 7, Side::Buy, ONE)).unwrap();
    assert!(eng
        .account(&who())
        .unwrap()
        .reservation(OrderId(1))
        .is_none());

    assert_eq!(eng.settle(&who(), BTC, TradeId(7), 0).unwrap(), 0);
    let acct = eng.account(&who()).unwrap();
    assert_eq!(acct.pending_im(), 0);
    assert_eq!(acct.position(BTC).size, ONE as i128);
    // im now from settled position at mark
    assert_eq!(eng.free_margin(&who(), &marks).unwrap(), 500 * USDC);
    assert_eq!(
        eng.settle(&who(), BTC, TradeId(7), 0),
        Err(RiskError::UnknownPending(BTC, TradeId(7)))
    );
}

#[test]
fn closing_fill_needs_no_im_and_realizes_pnl() {
    let (mut eng, mut marks) = setup(1_000 * USDC);
    eng.on_fill(who(), &leg(1, 1, Side::Buy, ONE)).unwrap();
    eng.settle(&who(), BTC, TradeId(1), 0).unwrap();

    let mut close = leg(2, 2, Side::Sell, ONE);
    close.price = Price(11_000_000_000);
    eng.on_fill(who(), &close).unwrap();
    assert_eq!(eng.account(&who()).unwrap().pending_im(), 0);

    assert_eq!(
        eng.settle(&who(), BTC, TradeId(2), 0).unwrap(),
        1_000 * USDC
    );
    let acct = eng.account(&who()).unwrap();
    assert!(acct.position(BTC).is_flat());
    assert_eq!(acct.collateral(), 2_000 * USDC);
    marks.set(BTC, Price(1));
    assert_eq!(eng.free_margin(&who(), &marks).unwrap(), 2_000 * USDC);
}

#[test]
fn reduce_only_reserves_nothing() {
    let (mut eng, marks) = setup(0);
    let mut o = intent(1, Side::Sell, ONE);
    o.reduce_only = true;
    assert_eq!(eng.check_and_reserve(who(), &o, &marks).unwrap(), 0);
}

#[test]
fn upnl_feeds_free_margin() {
    let (mut eng, mut marks) = setup(1_000 * USDC);
    eng.on_fill(who(), &leg(1, 1, Side::Buy, ONE)).unwrap();
    eng.settle(&who(), BTC, TradeId(1), 0).unwrap();
    // mark -5%: upnl -500, im at mark 475
    marks.set(BTC, Price(9_500_000_000));
    assert_eq!(eng.free_margin(&who(), &marks).unwrap(), 25 * USDC);
    assert!(eng
        .check_and_reserve(who(), &intent(2, Side::Buy, ONE / 10), &marks)
        .is_err());
    assert!(eng
        .check_and_reserve(who(), &intent(3, Side::Buy, ONE / 100), &marks)
        .is_ok());
}

#[test]
fn discard_drops_pending_and_errors() {
    let (mut eng, marks) = setup(1_000 * USDC);
    eng.on_fill(who(), &leg(1, 1, Side::Buy, ONE)).unwrap();
    assert_eq!(
        eng.on_fill(who(), &leg(1, 1, Side::Buy, ONE)),
        Err(RiskError::DuplicatePending(BTC, TradeId(1)))
    );
    eng.discard(&who(), BTC, TradeId(1)).unwrap();
    assert_eq!(eng.free_margin(&who(), &marks).unwrap(), 1_000 * USDC);

    eng.check_and_reserve(who(), &intent(5, Side::Buy, ONE), &marks)
        .unwrap();
    assert_eq!(
        eng.check_and_reserve(who(), &intent(5, Side::Buy, ONE), &marks),
        Err(RiskError::DuplicateOrder(OrderId(5)))
    );
    let mut bad = intent(6, Side::Buy, ONE);
    bad.market = MarketId(99);
    assert_eq!(
        eng.check_and_reserve(who(), &bad, &marks),
        Err(RiskError::UnknownMarket(MarketId(99)))
    );
}

#[test]
fn missing_mark_is_error() {
    let (mut eng, _) = setup(1_000 * USDC);
    eng.on_fill(who(), &leg(1, 1, Side::Buy, ONE)).unwrap();
    eng.settle(&who(), BTC, TradeId(1), 0).unwrap();
    assert_eq!(
        eng.free_margin(&who(), &Marks::new()),
        Err(RiskError::MissingMark(BTC))
    );
}

#[test]
fn set_position_overwrites_and_clears() {
    let (mut eng, _) = setup(1_000 * USDC);
    let long = Position {
        size: ONE as i128,
        entry_notional: 10_000 * USDC as u128,
    };
    eng.set_position(who(), BTC, long, 0);
    assert_eq!(eng.account(&who()).unwrap().position(BTC), long);
    eng.set_position(who(), BTC, Position::default(), 0);
    assert_eq!(eng.account(&who()).unwrap().positions().count(), 0);
}

fn long(qty: u64) -> Position {
    Position {
        size: qty as i128,
        entry_notional: qty as u128 * 100,
    }
}

#[test]
fn chain_before_settle_no_double_count() {
    let (mut eng, _) = setup(1_000 * USDC);
    eng.on_fill(who(), &leg(1, 1, Side::Buy, ONE)).unwrap();
    // indexer saw the mined fill at block 10 first
    eng.set_position(who(), BTC, long(ONE), 10);
    eng.set_collateral(who(), 990 * USDC, 10);
    assert_eq!(eng.settle(&who(), BTC, TradeId(1), 10).unwrap(), 0);
    let acct = eng.account(&who()).unwrap();
    assert_eq!(acct.position(BTC), long(ONE));
    assert_eq!(acct.collateral(), 990 * USDC);
    assert_eq!(acct.pending().count(), 0);
}

#[test]
fn settle_before_chain_then_overwrite() {
    let (mut eng, _) = setup(1_000 * USDC);
    eng.set_position(who(), BTC, long(ONE), 5);
    eng.on_fill(who(), &leg(1, 1, Side::Buy, ONE)).unwrap();
    eng.settle(&who(), BTC, TradeId(1), 10).unwrap();
    assert_eq!(
        eng.account(&who()).unwrap().position(BTC).size,
        2 * ONE as i128
    );
    eng.set_position(who(), BTC, long(2 * ONE), 10);
    assert_eq!(eng.account(&who()).unwrap().position(BTC), long(2 * ONE));
}

#[test]
fn reduce_only_accepted_when_underwater() {
    let (mut eng, mut marks) = setup(1_000 * USDC);
    eng.on_fill(who(), &leg(1, 1, Side::Buy, ONE)).unwrap();
    eng.settle(&who(), BTC, TradeId(1), 0).unwrap();
    marks.set(BTC, Price(9_000_000_000));
    assert!(eng.free_margin(&who(), &marks).unwrap() < 0);
    let mut o = intent(2, Side::Sell, ONE);
    assert!(eng.check_and_reserve(who(), &o, &marks).is_err());
    o.reduce_only = true;
    assert_eq!(eng.check_and_reserve(who(), &o, &marks).unwrap(), 0);
}
