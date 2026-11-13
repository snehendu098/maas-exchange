// parity with margin.json, contracts margin math must match

use risk::math::{margin, notional_wide};
use risk::{equity, Account, Marks, Position, RiskEngine};
use serde::Deserialize;
use types::{AccountId, MarketConfig, MarketId, Markets, Price, Qty, Side};

#[derive(Deserialize)]
struct Fixture {
    cases: Vec<Case>,
}

#[derive(Deserialize)]
struct Case {
    name: String,
    imr_bps: u32,
    mmr_bps: u32,
    collateral: i128,
    size: i128,
    entry_price: u64,
    mark_price: u64,
    expected: Expected,
}

#[derive(Deserialize)]
struct Expected {
    entry_notional: u128,
    notional: u128,
    im: u128,
    mm: u128,
    upnl: i128,
    equity: i128,
}

const MKT: MarketId = MarketId(0);

fn load() -> Vec<Case> {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/margin.json");
    let raw = std::fs::read_to_string(path).expect("fixture readable");
    serde_json::from_str::<Fixture>(&raw)
        .expect("fixture parses")
        .cases
}

// build account via real fill + settle path, not by poking fields
fn account_for(case: &Case) -> Account {
    let markets = Markets::new(vec![MarketConfig {
        id: MKT,
        symbol: "FX".into(),
        tick: Price(1),
        lot: Qty(1),
        imr_bps: case.imr_bps,
        mmr_bps: case.mmr_bps,
    }])
    .unwrap();
    let mut eng = RiskEngine::new(markets);
    let who = AccountId::new("t1.testnet").unwrap();
    eng.set_collateral(who, case.collateral, 0);
    if case.size != 0 {
        let side = if case.size > 0 { Side::Buy } else { Side::Sell };
        let leg = risk::FillLeg {
            order: types::OrderId(1),
            market: MKT,
            trade_id: types::TradeId(1),
            side,
            price: Price(case.entry_price),
            qty: Qty(case.size.unsigned_abs() as u64),
        };
        eng.on_fill(who, &leg).unwrap();
        eng.settle(&who, MKT, leg.trade_id, 0).unwrap();
    }
    eng.account(&who).unwrap().clone()
}

#[test]
fn margin_fixture_parity() {
    let cases = load();
    assert!(cases.len() >= 10);
    for c in &cases {
        let abs = c.size.unsigned_abs();
        let mark = Price(c.mark_price);
        let n = notional_wide(mark, abs);
        assert_eq!(n, c.expected.notional, "{} notional", c.name);
        assert_eq!(margin(n, c.imr_bps), c.expected.im, "{} im", c.name);
        assert_eq!(margin(n, c.mmr_bps), c.expected.mm, "{} mm", c.name);

        let acct = account_for(c);
        let pos: Position = acct.position(MKT);
        assert_eq!(pos.size, c.size, "{} size", c.name);
        assert_eq!(
            pos.entry_notional, c.expected.entry_notional,
            "{} entry",
            c.name
        );
        assert_eq!(pos.upnl(mark), c.expected.upnl, "{} upnl", c.name);

        let marks: Marks = [(MKT, mark)].into_iter().collect();
        assert_eq!(
            equity(&acct, &marks).unwrap(),
            c.expected.equity,
            "{} equity",
            c.name
        );
    }
}
