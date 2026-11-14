use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, NearToken};

use crate::*;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

const T0: u64 = 1_000_000_000;
/// 1 NEAR-ish base with 6 decimals keeps numbers readable; price 5 USDC.
const UNIT: u128 = 1_000_000;

fn at(who: &str, ms: u64) {
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(acc(who))
        .block_timestamp(ms * 1_000_000)
        .attached_deposit(NearToken::from_yoctonear(1))
        .build());
}

fn params() -> Params {
    Params {
        base_fee_bps: 3,
        gap_share_bps: 5000,
        cap_bps: 100,
        stale_fee_bps: 10,
        max_price_age_ms: 60_000,
    }
}

/// Pool 0 USDC/base at 5 USDC, 1M USDC deep, LP `alice`, oracle fresh at T0.
fn setup() -> MaasPool {
    at("owner", T0);
    let mut c = MaasPool::new(
        acc("owner"),
        acc("keeper"),
        acc("vault"),
        acc("usdc"),
        params(),
    );
    c.add_pool(acc("base"), 6);
    fund(&mut c, "alice", 1_000_000 * UNIT, 200_000 * UNIT, T0);
    at("alice", T0);
    c.add_liquidity(0, [U128(1_000_000 * UNIT), U128(200_000 * UNIT)], U128(0));
    price(&mut c, 5 * UNIT, T0);
    c
}

fn fund(c: &mut MaasPool, who: &str, usdc: u128, base: u128, ms: u64) {
    for (t, a) in [("usdc", usdc), ("base", base)] {
        if a > 0 {
            at(t, ms);
            let _ = c.ft_on_transfer(acc(who), U128(a), String::new());
        }
    }
}

fn price(c: &mut MaasPool, p: u128, ms: u64) {
    at("keeper", ms);
    c.push_prices(vec![(0, U128(p), ms)]);
}

fn buy(c: &mut MaasPool, who: &str, usdc: u128, ms: u64) -> u128 {
    fund(c, who, usdc, 0, ms);
    at(who, ms);
    c.swap(
        vec![SwapAction {
            pool_id: 0,
            token_in: acc("usdc"),
            amount_in: Some(U128(usdc)),
            token_out: acc("base"),
            min_amount_out: U128(0),
        }],
        None,
    )
    .0
}

fn earned(c: &MaasPool, who: &str, ms: u64) -> u128 {
    at(who, ms);
    c.lp(0, acc(who)).earned[0].0
}

#[test]
fn vault_pays_zero_fee_others_pay_base() {
    let mut c = setup();
    let v = buy(&mut c, "vault", 1_000 * UNIT, T0);
    assert_eq!(c.pool_view(0).streams[0].left.0, 0, "vault paid no fee");
    let mut c2 = setup();
    let b = buy(&mut c2, "bob", 1_000 * UNIT, T0);
    assert!(b < v);
    // 1000 USDC buy moves price ~0.2% away from oracle: 3 + 50% of ~20 bps
    let fee = c2.pool_view(0).streams[0].left.0;
    assert!(
        fee > 1_000 * UNIT * 3 / 10_000 && fee < 1_000 * UNIT * 20 / 10_000,
        "fee {fee}"
    );
}

#[test]
fn toxic_flow_capped_and_stale_flat() {
    let mut c = setup();
    at("bob", T0);
    assert_eq!(c.fee_bps(0, 0, 500_000 * UNIT), 100, "cap");
    // swap that closes the gap pays base only
    price(&mut c, 6 * UNIT, T0 + 1);
    at("bob", T0 + 1);
    assert_eq!(c.fee_bps(0, 0, 1_000 * UNIT), 3);
    at("bob", T0 + 61_002);
    assert_eq!(c.fee_bps(0, 0, 1_000 * UNIT), 10, "stale");
}

#[test]
fn full_hour_lp_gets_all() {
    let mut c = setup();
    buy(&mut c, "bob", 10_000 * UNIT, T0);
    let fee = c.pool_view(0).streams[0].left.0;
    assert!(earned(&c, "alice", T0 + DURATION_MS / 2).abs_diff(fee / 2) <= 1);
    assert!(earned(&c, "alice", T0 + DURATION_MS).abs_diff(fee) <= 1);
    at("alice", T0 + 2 * DURATION_MS);
    let got = c.claim(0)[0].0;
    assert!(got.abs_diff(fee) <= 1);
    assert_eq!(c.get_deposit(acc("alice"), acc("usdc")).0, got);
}

#[test]
fn jit_gets_nothing() {
    let mut c = setup();
    let t = T0 + 10;
    // JIT: 10x liquidity, victim swap, remove, all in one block
    fund(&mut c, "jit", 10_000_000 * UNIT, 2_000_000 * UNIT, t);
    at("jit", t);
    let s = c.add_liquidity(
        0,
        [U128(10_000_000 * UNIT), U128(2_000_000 * UNIT)],
        U128(0),
    );
    buy(&mut c, "bob", 50_000 * UNIT, t);
    at("jit", t);
    c.remove_liquidity(0, s, [U128(0), U128(0)]);
    let fee = c.pool_view(0).streams[0].left.0;
    assert!(fee > 0);
    assert_eq!(earned(&c, "jit", t + DURATION_MS), 0, "jit earned");
    assert!(
        earned(&c, "alice", t + DURATION_MS).abs_diff(fee) <= 1,
        "alice keeps all"
    );
}

#[test]
fn two_lps_proportional() {
    let mut c = setup();
    fund(&mut c, "carol", 1_000_000 * UNIT, 200_000 * UNIT, T0);
    at("carol", T0);
    c.add_liquidity(0, [U128(1_000_000 * UNIT), U128(200_000 * UNIT)], U128(0));
    buy(&mut c, "bob", 10_000 * UNIT, T0);
    let fee = c.pool_view(0).streams[0].left.0;
    let (a, b) = (
        earned(&c, "alice", T0 + DURATION_MS),
        earned(&c, "carol", T0 + DURATION_MS),
    );
    assert!(
        a.abs_diff(b) <= 1 && (a + b).abs_diff(fee) <= 2,
        "{a} {b} {fee}"
    );
}

#[test]
fn reward_streams_and_pauses_without_lps() {
    at("owner", T0);
    let mut c = MaasPool::new(
        acc("owner"),
        acc("keeper"),
        acc("vault"),
        acc("usdc"),
        params(),
    );
    c.add_pool(acc("base"), 6);
    at("usdc", T0);
    let _ = c.ft_on_transfer(acc("vault"), U128(3_600 * UNIT), r#"{"reward":0}"#.into());
    // nobody in pool for 1h: nothing streams, finish moves out
    fund(&mut c, "alice", 5 * UNIT, UNIT, T0 + DURATION_MS);
    at("alice", T0 + DURATION_MS);
    c.add_liquidity(0, [U128(5 * UNIT), U128(UNIT)], U128(0));
    assert!(earned(&c, "alice", T0 + 2 * DURATION_MS).abs_diff(3_600 * UNIT) <= 1);
}

#[test]
fn withdraw_failure_recredits() {
    let mut c = setup();
    fund(&mut c, "bob", 7, 0, T0);
    at("bob", T0);
    let _ = c.withdraw(acc("usdc"), U128(7), None);
    assert_eq!(c.get_deposit(acc("bob"), acc("usdc")).0, 0);
    at("maas-pool", T0);
    assert_eq!(
        c.on_withdraw(
            acc("bob"),
            acc("usdc"),
            U128(7),
            Err(near_sdk::PromiseError::Failed)
        )
        .0,
        0
    );
    assert_eq!(c.get_deposit(acc("bob"), acc("usdc")).0, 7);
}

#[test]
#[should_panic(expected = "slippage")]
fn min_out_enforced() {
    let mut c = setup();
    fund(&mut c, "bob", 1_000 * UNIT, 0, T0);
    at("bob", T0);
    c.swap(
        vec![SwapAction {
            pool_id: 0,
            token_in: acc("usdc"),
            amount_in: Some(U128(1_000 * UNIT)),
            token_out: acc("base"),
            min_amount_out: U128(200 * UNIT),
        }],
        None,
    );
}
