use super::*;
use near_sdk::PromiseError;

fn keeper(e: &mut Env) {
    e.call("keeper", 0);
}

fn hedge(e: &mut Env, i: u32) {
    keeper(e);
    e.v.set_mode(i, Mode::Hedged, "r1".into());
}

#[test]
fn mode_cooldown_enforced() {
    let mut e = Env::new();
    hedge(&mut e, 0);
    assert_eq!(e.v.mode(0), Mode::Hedged);
    e.now_ms += 3_600_000;
    keeper(&mut e);
    e.v.set_mode(0, Mode::Flat, "r2".into());
    assert_eq!(e.v.mode(0), Mode::Flat);
}

#[test]
#[should_panic(expected = "cooldown")]
fn mode_change_in_cooldown_rejected() {
    let mut e = Env::new();
    hedge(&mut e, 0);
    e.now_ms += 3_599_999;
    keeper(&mut e);
    e.v.set_mode(0, Mode::Flat, "r2".into());
}

#[test]
#[should_panic(expected = "same mode")]
fn mode_same_rejected() {
    let mut e = Env::new();
    keeper(&mut e);
    e.v.set_mode(0, Mode::Flat, "r".into());
}

#[test]
#[should_panic(expected = "not keeper")]
fn mode_only_keeper() {
    let mut e = Env::new();
    e.call("alice", 0);
    e.v.set_mode(0, Mode::Hedged, "r".into());
}

#[test]
#[should_panic(expected = "not hedged")]
fn buy_requires_hedged() {
    let mut e = Env::new();
    e.v.ref_usdc = K;
    keeper(&mut e);
    let _ = e.v.swap(0, false, U128(K), U128(0));
}

#[test]
fn buy_debits_then_callback_credits_spot() {
    let mut e = Env::new();
    e.v.ref_usdc = K;
    hedge(&mut e, 0);
    let _ = e.v.swap(0, false, U128(K), U128(0));
    assert_eq!((e.v.ref_usdc, e.v.in_flight), (0, 1));
    e.call("vault", 0);
    assert_eq!(
        e.v.on_swap(0, false, U128(K), Ok(U128(1_000_000))).0,
        1_000_000
    );
    assert_eq!((e.v.spot[0], e.v.in_flight), (1_000_000, 0));
}

#[test]
fn swap_failure_refunds() {
    let mut e = Env::new();
    e.v.spot[0] = 1_000_000;
    keeper(&mut e);
    let _ = e.v.swap(0, true, U128(1_000_000), U128(0));
    assert_eq!(e.v.spot[0], 0);
    e.call("vault", 0);
    e.v.on_swap(0, true, U128(1_000_000), Err(PromiseError::Failed));
    assert_eq!(e.v.spot[0], 1_000_000);
}

#[test]
fn swap_min_out_is_oracle_minus_slippage() {
    let e = Env::new();
    // sell 0.01 BTC @ 100k = 1000 USDC, -0.5%
    assert_eq!(e.v.swap_min_out(0, true, 1_000_000), 995_000_000);
    // buy 1000 USDC of BTC = 0.01 BTC, -0.5%
    assert_eq!(e.v.swap_min_out(0, false, K), 995_000);
}

#[test]
#[should_panic(expected = "over short")]
fn sell_cannot_leave_short_uncovered() {
    let mut e = Env::new();
    e.v.spot[0] = 1_000_000;
    e.sync(0, [-1_000_000, 0, 0], [100_000_000_000, 1, 1]);
    keeper(&mut e);
    let _ = e.v.swap(0, true, U128(1), U128(0));
}

#[test]
fn deposit_margin_moves_idle_and_tracks_equity() {
    let mut e = Env::new();
    e.deposit("alice", K);
    keeper(&mut e);
    let _ = e.v.deposit_margin(U128(600_000_000));
    assert_eq!(e.v.idle().0, 400_000_000);
    // exchange used 500 of 600
    e.call_with(
        "vault",
        0,
        vec![PromiseResult::Successful(b"\"500000000\"".to_vec())],
    );
    e.v.on_margin_deposit(U128(600_000_000));
    assert_eq!(e.v.idle().0, 500_000_000);
    assert_eq!(e.v.perp_equity().0, 500_000_000);
    assert_eq!(e.v.nav().0, K);
}

#[test]
#[should_panic(expected = "op in flight")]
fn deposit_blocked_while_margin_in_flight() {
    let mut e = Env::new();
    e.deposit("alice", K);
    keeper(&mut e);
    let _ = e.v.deposit_margin(U128(1));
    e.deposit("bob", K);
}

#[test]
#[should_panic(expected = "reserved")]
fn deposit_margin_cannot_spend_queued_reserve() {
    let mut e = Env::new();
    e.deposit("alice", K);
    e.v.idle = 0;
    e.sync(K as i128, [0; 3], [1; 3]);
    e.call("alice", 1);
    e.v.request_redeem(U128(K / 2));
    e.v.idle = K / 2;
    e.sync(K as i128 / 2, [0; 3], [1; 3]);
    keeper(&mut e);
    let _ = e.v.deposit_margin(U128(1));
}

#[test]
fn withdraw_margin_callback() {
    let mut e = Env::new();
    keeper(&mut e);
    let _ = e.v.withdraw_margin(U128(K));
    e.call("vault", 0);
    assert!(!e.v.on_margin_withdraw(U128(K), Ok(false)));
    assert_eq!(e.v.idle().0, 0);
    keeper(&mut e);
    let _ = e.v.withdraw_margin(U128(K));
    e.call("vault", 0);
    assert!(e.v.on_margin_withdraw(U128(K), Ok(true)));
    assert_eq!(e.v.idle().0, K);
    assert_eq!(e.v.perp_equity().0, -(K as i128));
}

#[test]
fn ref_deposit_and_withdraw_accounting() {
    let mut e = Env::new();
    e.deposit("alice", K);
    keeper(&mut e);
    let _ = e.v.ref_deposit(U128(K));
    e.call_with(
        "vault",
        0,
        vec![PromiseResult::Successful(format!("\"{K}\"").into_bytes())],
    );
    e.v.on_ref_deposit(U128(K));
    assert_eq!((e.v.idle().0, e.v.ref_usdc().0), (0, K));
    keeper(&mut e);
    let _ = e.v.ref_withdraw(U128(K));
    e.call_with(
        "vault",
        0,
        vec![PromiseResult::Successful(b"\"0\"".to_vec())],
    ); // ref transfer failed
    e.v.on_ref_withdraw(U128(K));
    assert_eq!((e.v.idle().0, e.v.ref_usdc().0), (0, K));
}
