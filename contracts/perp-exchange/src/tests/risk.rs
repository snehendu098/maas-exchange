use super::*;
use near_sdk::json_types::I128;

const OK: i128 = 100_000_000_000;

fn fund_rate(e: &mut Env, rate: i128) {
    e.call("keeper", 0);
    e.ex.update_funding(BTC, I128(rate));
}

#[test]
fn funding_accrual_zero_sum() {
    let mut e = Env::new();
    e.exempt(&["alice", "bob"]);
    e.trade("alice", true, P, ONE);
    fund_rate(&mut e, 1_000_000_000_000_000); // 0.1% at 100k
    assert_eq!(
        e.ex.funding_index(BTC).0,
        100_000_000_000_000_000_000_000_000
    );
    assert_eq!(e.equity("alice"), OK - 100_000_000);
    assert_eq!(e.equity("bob"), OK + 100_000_000);
    e.trade("alice", false, P, ONE);
    assert_eq!(e.coll("alice"), OK - 100_000_000);
    assert_eq!(e.coll("bob"), OK + 100_000_000);
}

#[test]
fn funding_dust_to_insurance_exactly_zero_sum() {
    let mut e = Env::new();
    e.exempt(&["alice", "bob"]);
    e.trade("alice", true, P, 30_000);
    fund_rate(&mut e, 3);
    for _ in 0..5 {
        fund_rate(&mut e, -700_000_000_000_000);
    }
    e.trade("alice", false, P, 30_000);
    let total = e.coll("alice") + e.coll("bob") + e.coll("ins");
    let unit = perp_math::FUNDING_UNIT as i128;
    assert_eq!(total * unit + e.ex.funding_dust().0 as i128, 2 * OK * unit);
    assert!(e.coll("alice") > OK); // longs received (rate < 0)
}

#[test]
#[should_panic(expected = "not keeper")]
fn funding_only_keeper() {
    let mut e = Env::new();
    e.call("alice", 0);
    e.ex.update_funding(BTC, I128(1));
}

#[test]
#[should_panic(expected = "rate too high")]
fn funding_capped() {
    let mut e = Env::new();
    fund_rate(&mut e, -10_000_000_000_000_001);
}

fn open_thin(e: &mut Env) {
    e.fund("carol", 5_100_000_000);
    e.exempt(&["alice", "carol"]);
    e.trade_as("carol", "alice", true, P, ONE);
}

fn liq(e: &mut Env, who: &str) {
    e.call("keeper", 0);
    e.ex.liquidate(acc(who), BTC);
}

#[test]
#[should_panic(expected = "not liquidatable")]
fn liquidate_healthy_rejected() {
    let mut e = Env::new();
    open_thin(&mut e);
    liq(&mut e, "carol");
}

#[test]
fn liquidate_penalty_to_insurance() {
    let mut e = Env::new();
    open_thin(&mut e);
    e.set_price(97_000_000_000); // equity 2100 < mm 2425
    liq(&mut e, "carol");
    assert_eq!(e.size("carol"), 0);
    assert_eq!(
        (e.size("ins"), e.entry("ins")),
        (ONE as i128, 97_000_000_000)
    );
    let penalty = 1_212_500_000; // ceil(97000e6 * 125 / 1e4)
    assert_eq!(e.coll("carol"), 2_100_000_000 - penalty);
    assert_eq!(e.coll("ins"), penalty);
    assert_eq!(e.size("ins") + e.size("carol") + e.size("alice"), 0);
}

#[test]
fn liquidate_bad_debt_absorbed_by_insurance() {
    let mut e = Env::new();
    open_thin(&mut e);
    e.set_price(90_000_000_000); // equity -4900
    liq(&mut e, "carol");
    assert_eq!(e.coll("carol"), 0);
    assert_eq!(e.coll("ins"), -4_900_000_000);
    assert_eq!(e.size("ins"), ONE as i128);
}

#[test]
#[should_panic(expected = "not liquidatable")]
fn liquidate_insurance_rejected() {
    let mut e = Env::new();
    liq(&mut e, "ins");
}

#[test]
#[should_panic(expected = "not keeper")]
fn liquidate_only_keeper() {
    let mut e = Env::new();
    open_thin(&mut e);
    e.call("bob", 0);
    e.ex.liquidate(acc("carol"), BTC);
}
