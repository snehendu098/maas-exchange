use near_contract_standards::fungible_token::core::FungibleTokenCore;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, NearToken, PromiseResult, RuntimeFeesConfig};

use crate::*;

mod keeper;
mod queue;

pub const T0: u64 = 1_700_000_000_000;
pub const K: u128 = 1_000_000_000; // 1000 USDC

pub fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

pub fn cfg() -> Config {
    Config {
        weights_bps: [5000, 3000, 2000],
        short_leverage_bps: 10_000,
        idle_buffer_bps: 1000,
        withdraw_fee_bps: 10,
        cooldown_ms: 3_600_000,
        price_band_bps: 100,
        slippage_bps: 50,
        size_cap: [U128(1_000_000_000); 3],
        max_price_age_ms: 60_000,
    }
}

fn mk(base: &str, dec: u8, pool: u64) -> VaultMarket {
    VaultMarket {
        base_token: acc(base),
        base_decimals: dec,
        ref_pool_id: pool,
    }
}

pub struct Env {
    pub v: DeltaVault,
    pub now_ms: u64,
}

fn set_ctx(who: &str, now_ms: u64, yocto: u128, results: Vec<PromiseResult>) {
    let ctx = VMContextBuilder::new()
        .current_account_id(acc("vault"))
        .predecessor_account_id(acc(who))
        .attached_deposit(NearToken::from_yoctonear(yocto))
        .block_timestamp(now_ms * 1_000_000)
        .build();
    testing_env!(
        ctx,
        near_sdk::test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        results
    );
}

impl Env {
    pub fn new() -> Self {
        set_ctx("owner", T0, 0, vec![]);
        let markets = [mk("wbtc", 8, 1), mk("weth", 18, 2), mk("wnear", 24, 3)];
        let v = DeltaVault::new(
            acc("owner"),
            acc("keeper"),
            acc("usdc"),
            acc("exchange"),
            acc("ref"),
            markets,
            cfg(),
        );
        let mut e = Env { v, now_ms: T0 };
        e.sync(0, [0; 3], [100_000_000_000, 3_000_000_000, 5_000_000]);
        e
    }

    pub fn call(&mut self, who: &str, yocto: u128) {
        set_ctx(who, self.now_ms, yocto, vec![]);
    }

    pub fn call_with(&mut self, who: &str, yocto: u128, results: Vec<PromiseResult>) {
        set_ctx(who, self.now_ms, yocto, results);
    }
    /// Feeds on_sync the 7 joined view results.
    pub fn sync(&mut self, equity: i128, sizes: [i128; 3], prices: [u128; 3]) -> bool {
        let ok =
            |v: near_sdk::serde_json::Value| PromiseResult::Successful(v.to_string().into_bytes());
        let mut r = vec![ok(json!(equity.to_string()))];
        for i in 0..3 {
            r.push(ok(json!({"size": sizes[i].to_string(), "entry_notional": "0", "last_funding_index": "0"})));
            r.push(ok(json!(prices[i].to_string())));
        }
        self.call_with("vault", 0, r);
        self.v.on_sync(self.v.epoch)
    }

    pub fn deposit(&mut self, who: &str, amount: u128) {
        self.call("usdc", 0);
        let _ = self.v.ft_on_transfer(acc(who), U128(amount), String::new());
    }

    pub fn shares(&self, who: &str) -> u128 {
        self.v.ft_balance_of(acc(who)).0
    }
}
