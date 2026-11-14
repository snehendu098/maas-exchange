use super::*;
use near_sdk::PromiseError;

#[test]
fn first_deposit_mints_one_to_one() {
    let mut e = Env::new();
    e.deposit("alice", K);
    assert_eq!(e.shares("alice"), K);
    assert_eq!(e.v.nav().0, K);
}

#[test]
#[should_panic(expected = "stale snapshot")]
fn deposit_rejects_stale_snapshot() {
    let mut e = Env::new();
    e.now_ms += 60_001;
    e.deposit("alice", K);
}

#[test]
#[should_panic(expected = "only usdc")]
fn deposit_rejects_other_token() {
    let mut e = Env::new();
    e.call("wbtc", 0);
    let _ = e.v.ft_on_transfer(acc("alice"), U128(K), String::new());
}

#[test]
fn nav_counts_spot_and_perp() {
    let mut e = Env::new();
    e.deposit("alice", K);
    e.v.spot[0] = 1_000_000; // 0.01 BTC @ 100k = 1000 USDC
    e.sync(
        -200_000_000,
        [-1_000_000, 0, 0],
        [100_000_000_000, 3_000_000_000, 5_000_000],
    );
    assert_eq!(e.v.spot_value().0, K);
    assert_eq!(e.v.spot_size(0).0, 1_000_000);
    assert_eq!(e.v.nav().0, 2 * K - 200_000_000);
}

#[test]
fn second_deposit_priced_at_nav() {
    let mut e = Env::new();
    e.deposit("alice", K);
    e.sync(K as i128, [0; 3], [1; 3]); // vault doubled
    e.deposit("bob", K);
    let s = e.shares("bob");
    assert!(s == K / 2 || s == K / 2 - 1, "{s}");
}

#[test]
fn redeem_instant_charges_fee() {
    let mut e = Env::new();
    e.deposit("alice", K);
    e.call("alice", 1);
    let r = e.v.request_redeem(U128(K));
    assert_eq!(
        r,
        RedeemResult {
            id: None,
            assets: U128(K - 1_000_000)
        }
    );
    assert_eq!(e.shares("alice"), 0);
    assert_eq!(e.v.idle().0, 1_000_000); // fee stays
}

#[test]
fn redeem_queues_rest_then_cancel_and_fulfill() {
    let mut e = Env::new();
    e.deposit("alice", K);
    // all idle moved to perp margin
    e.v.idle = 0;
    e.sync(K as i128, [0; 3], [1; 3]);
    e.call("alice", 1);
    let r = e.v.request_redeem(U128(400_000_000));
    assert_eq!(
        r,
        RedeemResult {
            id: Some(1),
            assets: U128(0)
        }
    );
    assert_eq!(e.v.total_queued_shares().0, 400_000_000);
    assert_eq!(e.shares("vault"), 400_000_000);
    assert_eq!(e.v.requests(1).unwrap().owner, acc("alice"));

    e.call("alice", 0);
    e.v.cancel_request(1);
    assert_eq!(e.shares("alice"), K);
    assert_eq!(e.v.total_queued_shares().0, 0);

    e.call("alice", 1);
    let r = e.v.request_redeem(U128(400_000_000));
    assert_eq!(r.id, Some(2));
    e.v.idle = K;
    e.sync(0, [0; 3], [1; 3]);
    e.call("keeper", 0);
    assert_eq!(e.v.fulfill(2).0, 400_000_000 - 400_000);
    assert_eq!(e.shares("vault"), 0);
    assert_eq!(e.v.ft_total_supply().0, 600_000_000);
    assert!(e.v.requests(2).is_none());
}

#[test]
fn redeem_partial_instant_reserves_queue() {
    let mut e = Env::new();
    e.deposit("alice", K);
    e.v.idle = 300_000_000;
    e.sync(700_000_000, [0; 3], [1; 3]);
    e.call("alice", 1);
    let r = e.v.request_redeem(U128(K));
    assert_eq!(r.id, Some(1));
    assert!(r.assets.0 > 299_000_000 && r.assets.0 < 300_000_000);
    assert!(e.v.total_queued_shares().0 > 699_000_000);
}

#[test]
#[should_panic(expected = "not request owner")]
fn cancel_only_owner() {
    let mut e = Env::new();
    e.deposit("alice", K);
    e.v.idle = 0;
    e.sync(K as i128, [0; 3], [1; 3]);
    e.call("alice", 1);
    e.v.request_redeem(U128(1));
    e.call("bob", 0);
    e.v.cancel_request(1);
}

#[test]
#[should_panic(expected = "not keeper")]
fn fulfill_only_keeper() {
    let mut e = Env::new();
    e.call("alice", 0);
    e.v.fulfill(1);
}

#[test]
fn payout_failure_remints() {
    let mut e = Env::new();
    e.deposit("alice", K);
    e.call("alice", 1);
    let r = e.v.request_redeem(U128(K));
    e.call("vault", 0);
    assert!(!e
        .v
        .on_payout(acc("alice"), U128(K), r.assets, Err(PromiseError::Failed)));
    assert_eq!(e.shares("alice"), K);
    assert_eq!(e.v.idle().0, K);
}

#[test]
fn sync_discarded_after_epoch_bump() {
    let mut e = Env::new();
    let epoch = e.v.epoch;
    e.v.epoch += 1;
    e.call("vault", 0);
    assert!(!e.v.on_sync(epoch));
}

#[test]
fn withdraw_fee_split_lp_treasury_and_paid_out() {
    let mut e = Env::new();
    e.deposit("alice", K);
    e.deposit("bob", K);
    e.call("alice", 1);
    let r = e.v.request_redeem(U128(K));
    // 10 bps of 1000 USDC = 1 USDC, half LP half treasury, held in idle outside NAV
    assert_eq!(r.assets.0, K - 1_000_000);
    assert_eq!(e.v.accrued_fees(), [U128(500_000), U128(500_000)]);
    assert_eq!(e.v.nav().0, K, "fee is not bob's");
    e.call("keeper", 0);
    let _ = e.v.pay_fees();
    assert_eq!(e.v.accrued_fees(), [U128(0), U128(0)]);
    assert_eq!(e.v.idle().0, K);
    // pool rejects one reward (unused amount returned): it re-accrues
    e.call_with(
        "vault",
        0,
        vec![PromiseResult::Successful(b"\"0\"".to_vec())],
    );
    e.v.on_lp_reward(U128(250_000));
    assert_eq!(e.v.accrued_fees()[0].0, 250_000);
    assert_eq!(e.v.idle().0, K + 250_000);
    assert_eq!(e.v.nav().0, K);
}
