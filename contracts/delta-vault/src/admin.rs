use near_sdk::serde_json::json;
use near_sdk::{near, AccountId};

use crate::events::emit;
use crate::{Config, DeltaVault, DeltaVaultExt, BPS};

#[near]
impl DeltaVault {
    pub fn set_config(&mut self, config: Config) {
        self.assert_role(&self.owner.clone(), "owner");
        validate(&config);
        emit("config_set", json!(config));
        self.cfg = config;
    }

    pub fn set_keeper(&mut self, keeper: AccountId) {
        self.assert_role(&self.owner.clone(), "owner");
        self.keeper = keeper;
    }
}

pub fn validate(c: &Config) {
    let sum: u128 = c.weights_bps.iter().map(|&w| w as u128).sum();
    assert!(
        sum == BPS
            && (10_000..=50_000).contains(&c.short_leverage_bps)
            && c.idle_buffer_bps <= 5000
            && c.withdraw_fee_bps <= 100
            && (1..=1000).contains(&c.price_band_bps)
            && c.slippage_bps <= 1000
            && c.max_price_age_ms > 0,
        "bad config"
    );
}
