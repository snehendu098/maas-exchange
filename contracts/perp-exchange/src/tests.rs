use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, NearToken, PromiseResult, PublicKey, RuntimeFeesConfig};

use crate::*;

pub const BTC: u32 = 0;
pub const ONE: u128 = 100_000_000;
pub const P: u128 = 100_000_000_000;
pub const T0: u64 = 1_700_000_000_000;

pub fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

pub struct Env {
    pub ex: PerpExchange,
    pub now_ms: u64,
}

impl Env {
    pub fn new() -> Self {
        let mut e = Env { ex: unsafe_new(), now_ms: T0 };
        e.call("owner", 0);
        e.ex.set_market(BTC, btc());
        e.set_price(P);
        e.deposit("alice", 100_000_000_000);
        e.deposit("bob", 100_000_000_000);
        e
    }

    pub fn call(&mut self, who: &str, yocto: u128) {
        self.call_with(who, yocto, vec![]);
    }

    pub fn call_with(&mut self, who: &str, yocto: u128, results: Vec<PromiseResult>) {
        let ctx = VMContextBuilder::new()
            .current_account_id(acc("exchange"))
            .predecessor_account_id(acc(who))
            .attached_deposit(NearToken::from_yoctonear(yocto))
            .block_timestamp(self.now_ms * 1_000_000)
            .build();
        testing_env!(ctx, near_sdk::test_vm_config(), RuntimeFeesConfig::test(), Default::default(), results);
    }

    pub fn deposit(&mut self, who: &str, amount: u128) {
        self.call("usdc", 0);
        let _ = self.ex.ft_on_transfer(acc(who), U128(amount), String::new());
    }

    pub fn set_price(&mut self, price: u128) {
        self.now_ms += 1;
        self.call("keeper", 0);
        self.ex.push_prices(vec![(BTC, U128(price), self.now_ms)]);
    }

    pub fn coll(&self, who: &str) -> i128 {
        self.ex.collateral(acc(who)).0
    }

    pub fn size(&self, who: &str) -> i128 {
        self.ex.position(acc(who), BTC).size.0
    }

    pub fn entry(&self, who: &str) -> u128 {
        self.ex.position(acc(who), BTC).entry_notional.0
    }

    pub fn equity(&self, who: &str) -> i128 {
        self.ex.equity(acc(who)).0
    }
}

fn unsafe_new() -> PerpExchange {
    testing_env!(VMContextBuilder::new().current_account_id(acc("exchange")).build());
    PerpExchange::new(acc("owner"), acc("operator"), acc("keeper"), acc("fees"), acc("ins"), acc("usdc"), 60_000)
}

/// 10x, mmr 5%, maker 2bps, taker 5bps.
pub fn btc() -> Market {
    Market {
        tick_size: U128(100_000),
        lot_size: U128(10_000),
        max_leverage: 10,
        imr_bps: 1000,
        mmr_bps: 500,
        maker_fee_bps: 2,
        taker_fee_bps: 5,
    }
}

pub fn ed_key() -> PublicKey {
    "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap()
}

#[test]
fn deposit_credits_sender_or_named_account() {
    let mut e = Env::new();
    assert_eq!(e.coll("alice"), 100_000_000_000);
    e.call("usdc", 0);
    let _ = e.ex.ft_on_transfer(acc("bob"), U128(5), r#"{"account_id":"carol"}"#.into());
    assert_eq!(e.coll("carol"), 5);
}

#[test]
#[should_panic(expected = "only usdc")]
fn deposit_rejects_other_token() {
    let mut e = Env::new();
    e.call("fake", 0);
    let _ = e.ex.ft_on_transfer(acc("alice"), U128(5), String::new());
}

#[test]
fn withdraw_debits_and_refunds_on_failure() {
    let mut e = Env::new();
    e.call("alice", 1);
    let _ = e.ex.withdraw(U128(40_000_000_000));
    assert_eq!(e.coll("alice"), 60_000_000_000);
    e.call_with("exchange", 0, vec![PromiseResult::Failed]);
    assert!(!e.ex.on_withdraw(acc("alice"), U128(40_000_000_000), Err(near_sdk::PromiseError::Failed)));
    assert_eq!(e.coll("alice"), 100_000_000_000);
}

#[test]
#[should_panic(expected = "insufficient collateral")]
fn withdraw_over_collateral() {
    let mut e = Env::new();
    e.call("alice", 1);
    let _ = e.ex.withdraw(U128(100_000_000_001));
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn withdraw_needs_one_yocto() {
    let mut e = Env::new();
    e.call("alice", 0);
    let _ = e.ex.withdraw(U128(1));
}

#[test]
fn trading_keys_add_remove() {
    let mut e = Env::new();
    e.call("alice", 1);
    e.ex.add_trading_key(ed_key());
    assert_eq!(e.ex.trading_keys(acc("alice")), vec![ed_key()]);
    e.ex.remove_trading_key(ed_key());
    assert!(e.ex.trading_keys(acc("alice")).is_empty());
}

#[test]
#[should_panic(expected = "ed25519 only")]
fn trading_key_rejects_secp() {
    let mut e = Env::new();
    e.call("alice", 1);
    let k = PublicKey::from_parts(near_sdk::CurveType::SECP256K1, vec![1; 64]).unwrap();
    e.ex.add_trading_key(k);
}

#[test]
#[should_panic(expected = "stale price")]
fn price_rejects_stale() {
    let mut e = Env::new();
    e.now_ms += 60_002;
    e.call("alice", 0);
    e.ex.price(BTC);
}

#[test]
#[should_panic(expected = "not keeper")]
fn push_prices_only_keeper() {
    let mut e = Env::new();
    e.call("alice", 0);
    e.ex.push_prices(vec![(BTC, U128(1), e.now_ms)]);
}

#[test]
fn push_prices_skips_older() {
    let mut e = Env::new();
    e.call("keeper", 0);
    e.ex.push_prices(vec![(BTC, U128(1), e.now_ms - 5)]);
    assert_eq!(e.ex.price(BTC).0, P);
}

#[test]
#[should_panic(expected = "bad market")]
fn set_market_validates() {
    let mut e = Env::new();
    e.call("owner", 0);
    e.ex.set_market(1, Market { max_leverage: 5, ..btc() });
}

#[test]
#[should_panic(expected = "not owner")]
fn admin_only_owner() {
    let mut e = Env::new();
    e.call("alice", 0);
    e.ex.set_operator(acc("alice"));
}
