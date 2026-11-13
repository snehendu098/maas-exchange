use super::*;

const OK: u128 = 100_000_000_000; // 100k USDC

#[test]
fn open_close_pnl() {
    let mut e = Env::new();
    e.exempt(&["alice", "bob"]);
    e.trade("alice", true, P, ONE);
    assert_eq!((e.size("alice"), e.size("bob")), (ONE as i128, -(ONE as i128)));
    assert_eq!(e.entry("alice"), 100_000_000_000);
    e.set_price(110_000_000_000);
    assert_eq!(e.equity("alice"), 110_000_000_000);
    assert_eq!(e.equity("bob"), 90_000_000_000);
    e.trade("alice", false, 110_000_000_000, ONE);
    assert_eq!(e.coll("alice"), 110_000_000_000);
    assert_eq!(e.coll("bob"), 90_000_000_000);
    assert_eq!((e.size("alice"), e.entry("alice")), (0, 0));
}

#[test]
fn partial_close_pnl() {
    let mut e = Env::new();
    e.exempt(&["alice", "bob"]);
    e.trade("alice", true, P, ONE);
    e.trade("alice", false, 105_000_000_000, 40_000_000);
    assert_eq!(e.coll("alice"), 102_000_000_000);
    assert_eq!((e.size("alice"), e.entry("alice")), (60_000_000, 60_000_000_000));
    assert_eq!(e.coll("bob"), 98_000_000_000);
}

#[test]
fn flip_pnl() {
    let mut e = Env::new();
    e.exempt(&["alice", "bob"]);
    e.trade("alice", true, P, ONE);
    e.trade("alice", false, 90_000_000_000, 150_000_000);
    assert_eq!(e.coll("alice"), 90_000_000_000);
    assert_eq!((e.size("alice"), e.entry("alice")), (-50_000_000, 45_000_000_000));
    assert_eq!((e.size("bob"), e.entry("bob")), (50_000_000, 45_000_000_000));
}

#[test]
fn close_basis_rounds_against_trader() {
    let mut e = Env::new();
    e.exempt(&["alice", "bob"]);
    let px = 100_000_100_000;
    e.set_price(px);
    e.trade("alice", true, px, 30_000); // entry 30000030
    e.trade("alice", false, px, 10_000); // basis ceil(30000030/3)
    assert_eq!(e.entry("alice"), 20_000_020);
    assert_eq!(e.coll("alice"), OK as i128);
    assert_eq!(e.coll("alice") + e.coll("bob"), 2 * OK as i128);
}

#[test]
fn fees_maker_taker() {
    let mut e = Env::new();
    e.trade("alice", true, P, ONE); // bob maker 2bps, alice taker 5bps
    assert_eq!(e.coll("bob"), (OK - 20_000_000) as i128);
    assert_eq!(e.coll("alice"), (OK - 50_000_000) as i128);
    assert_eq!(e.coll("fees"), 70_000_000);
}

#[test]
fn fees_exempt_pays_zero() {
    let mut e = Env::new();
    e.exempt(&["alice"]);
    e.trade("alice", true, P, ONE);
    assert_eq!(e.coll("alice"), OK as i128);
    assert_eq!(e.coll("fees"), 20_000_000);
}

#[test]
fn settle_logs_events_in_order() {
    let mut e = Env::new();
    e.trade("alice", true, P, ONE);
    let names: Vec<String> = near_sdk::test_utils::get_logs()
        .iter()
        .map(|l| {
            let v: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(&l["EVENT_JSON:".len()..]).unwrap();
            v["event"].as_str().unwrap().to_string()
        })
        .collect();
    assert_eq!(names, ["position_updated", "position_updated", "collateral_updated", "traded"]);
}

#[test]
#[should_panic(expected = "below initial margin")]
fn withdraw_blocked_under_im() {
    let mut e = Env::new();
    e.fund("carol", 10_000_000_000);
    e.exempt(&["alice", "carol"]);
    e.trade_as("carol", "alice", true, P, ONE);
    e.call("carol", 1);
    let _ = e.ex.withdraw(U128(5_000_000_000));
    assert_eq!(e.coll("carol"), 5_000_000_000);
    let _ = e.ex.withdraw(U128(1));
}

#[test]
#[should_panic(expected = "insufficient collateral")]
fn unrealized_profit_not_withdrawable() {
    let mut e = Env::new();
    e.exempt(&["alice", "bob"]);
    e.trade("alice", true, P, ONE);
    e.set_price(200_000_000_000);
    e.call("alice", 1);
    let _ = e.ex.withdraw(U128(OK + 1));
}

fn open_thin(e: &mut Env) {
    e.fund("carol", 5_100_000_000);
    e.exempt(&["alice", "carol"]);
    e.trade_as("carol", "alice", true, P, ONE);
}

#[test]
fn flat_negative_written_off_to_insurance() {
    let mut e = Env::new();
    open_thin(&mut e);
    e.set_price(90_000_000_000);
    e.trade_as("carol", "alice", false, 90_000_000_000, ONE);
    assert_eq!(e.coll("carol"), 0);
    assert_eq!(e.coll("ins"), -4_900_000_000);
}

#[test]
#[should_panic(expected = "below maintenance margin")]
fn reduce_to_negative_needs_mm() {
    let mut e = Env::new();
    open_thin(&mut e);
    e.set_price(90_000_000_000);
    e.trade_as("carol", "alice", false, 90_000_000_000, 60_000_000);
}

#[test]
#[should_panic(expected = "bad signature")]
fn reject_bad_sig() {
    let mut e = Env::new();
    let (mk, tk) = (e.order("bob", false, P, ONE), e.order("alice", true, P, ONE));
    let mut f = e.mk_fill(mk, tk, P, ONE);
    f.taker.price = U128(P + 100_000); // tampered after signing
    e.settle(f);
}

#[test]
#[should_panic(expected = "unknown key")]
fn reject_unregistered_key() {
    let mut e = Env::new();
    let (mk, tk) = (e.order("bob", false, P, ONE), e.order("alice", true, P, ONE));
    let mut f = e.mk_fill(mk, tk, P, ONE);
    f.taker_key = pubkey("bob");
    f.taker_sig = sign("bob", &f.taker);
    e.settle(f);
}

#[test]
#[should_panic(expected = "overfill")]
fn reject_overfill_and_replay() {
    let mut e = Env::new();
    let (mk, tk) = (e.order("bob", false, P, ONE), e.order("alice", true, P, ONE));
    let f = e.mk_fill(mk, tk, P, ONE / 2);
    e.settle(f.clone());
    e.settle(f.clone());
    assert_eq!(e.ex.filled(e.ex.order_hash(f.taker.clone())).0, ONE);
    e.settle(f);
}

#[test]
#[should_panic(expected = "expired")]
fn reject_expired() {
    let mut e = Env::new();
    let (mk, tk) = (e.order("bob", false, P, ONE), e.order("alice", true, P, ONE));
    let f = e.mk_fill(mk, tk, P, ONE);
    e.now_ms += 3_600_001;
    e.set_price(P);
    e.settle(f);
}

#[test]
#[should_panic(expected = "cancelled")]
fn reject_cancelled() {
    let mut e = Env::new();
    let (mk, tk) = (e.order("bob", false, P, ONE), e.order("alice", true, P, ONE));
    let f = e.mk_fill(mk, tk, P, ONE);
    e.call("alice", 0);
    e.ex.cancel(f.taker.clone());
    assert!(e.ex.cancelled(e.ex.order_hash(f.taker.clone())));
    e.settle(f);
}

#[test]
#[should_panic(expected = "not trader")]
fn cancel_only_trader() {
    let mut e = Env::new();
    let o = e.order("alice", true, P, ONE);
    e.call("bob", 0);
    e.ex.cancel(o);
}

#[test]
#[should_panic(expected = "worse than limit")]
fn reject_worse_than_limit() {
    let mut e = Env::new();
    let (mk, tk) = (e.order("bob", false, P, ONE), e.order("alice", true, P, ONE));
    let f = e.mk_fill(mk, tk, P + 100_000, ONE);
    e.settle(f);
}

#[test]
#[should_panic(expected = "market mismatch")]
fn reject_market_mismatch() {
    let mut e = Env::new();
    let (mut mk, tk) = (e.order("bob", false, P, ONE), e.order("alice", true, P, ONE));
    mk.market_id = 1;
    let f = e.mk_fill(mk, tk, P, ONE);
    e.settle(f);
}

#[test]
#[should_panic(expected = "unknown market")]
fn reject_unknown_market() {
    let mut e = Env::new();
    let (mut mk, mut tk) = (e.order("bob", false, P, ONE), e.order("alice", true, P, ONE));
    (mk.market_id, tk.market_id) = (3, 3);
    let f = e.mk_fill(mk, tk, P, ONE);
    e.settle(f);
}

#[test]
#[should_panic(expected = "off tick")]
fn reject_off_tick() {
    let mut e = Env::new();
    let (mk, tk) = (e.order("bob", false, P, ONE), e.order("alice", true, P + 1, ONE));
    let f = e.mk_fill(mk, tk, P + 1, ONE);
    e.settle(f);
}

#[test]
#[should_panic(expected = "off lot")]
fn reject_off_lot() {
    let mut e = Env::new();
    let (mk, tk) = (e.order("bob", false, P, ONE), e.order("alice", true, P, ONE));
    let f = e.mk_fill(mk, tk, P, ONE - 1);
    e.settle(f);
}

#[test]
#[should_panic(expected = "same side")]
fn reject_same_side() {
    let mut e = Env::new();
    let (mk, tk) = (e.order("bob", true, P, ONE), e.order("alice", true, P, ONE));
    let f = e.mk_fill(mk, tk, P, ONE);
    e.settle(f);
}

#[test]
#[should_panic(expected = "self trade")]
fn reject_self_trade() {
    let mut e = Env::new();
    let (mk, tk) = (e.order("alice", false, P, ONE), e.order("alice", true, P, ONE));
    let f = e.mk_fill(mk, tk, P, ONE);
    e.settle(f);
}

#[test]
#[should_panic(expected = "reduce only")]
fn reject_reduce_only_flip() {
    let mut e = Env::new();
    e.exempt(&["alice", "bob"]);
    e.trade("alice", true, P, ONE);
    let mut tk = e.order("alice", false, P, 2 * ONE);
    tk.reduce_only = true;
    let mk = e.order("bob", true, P, 2 * ONE);
    let f = e.mk_fill(mk.clone(), tk.clone(), P, ONE);
    e.settle(f);
    assert_eq!(e.size("alice"), 0);
    let f = e.mk_fill(mk, tk, P, ONE); // now flat: opening, not reducing
    e.settle(f);
}

#[test]
#[should_panic(expected = "below initial margin")]
fn reject_below_im() {
    let mut e = Env::new();
    e.trade("alice", true, P, 21 * ONE);
}

#[test]
fn reduce_allowed_under_im() {
    let mut e = Env::new();
    e.exempt(&["alice", "bob"]);
    e.trade("alice", true, P, 10 * ONE);
    e.set_price(94_000_000_000); // equity 40k < IM 47k
    e.trade("alice", false, 94_000_000_000, ONE);
    assert_eq!(e.size("alice"), 9 * ONE as i128);
}

#[test]
#[should_panic(expected = "not operator")]
fn reject_not_operator() {
    let mut e = Env::new();
    e.call("alice", 0);
    e.ex.settle(vec![]);
}

#[test]
fn order_hash_is_sha256_of_borsh() {
    let mut e = Env::new();
    let o = e.order("alice", true, P, ONE);
    let mut b = vec![5, 0, 0, 0];
    b.extend(b"alice");
    b.extend(0u32.to_le_bytes());
    b.push(1);
    b.extend(P.to_le_bytes());
    b.extend(ONE.to_le_bytes());
    b.push(0);
    b.extend(o.nonce.to_le_bytes());
    b.extend(o.expiry_ms.to_le_bytes());
    assert_eq!(e.ex.order_hash(o), orders::to_hex(&env::sha256_array(&b)));
}
