use near_sdk::{assert_one_yocto, env, near, AccountId, CurveType, PublicKey};

use crate::{PerpExchange, PerpExchangeExt};

const MAX_KEYS: usize = 8;

#[near]
impl PerpExchange {
    /// Registers an ed25519 key allowed to sign caller's orders.
    #[payable]
    pub fn add_trading_key(&mut self, public_key: PublicKey) {
        assert_one_yocto();
        assert!(
            public_key.curve_type() == CurveType::ED25519,
            "ed25519 only"
        );
        let a = env::predecessor_account_id();
        let mut keys = self.trading_keys.get(&a).cloned().unwrap_or_default();
        assert!(!keys.contains(&public_key), "key exists");
        assert!(keys.len() < MAX_KEYS, "too many keys");
        keys.push(public_key);
        self.trading_keys.insert(a, keys);
    }

    #[payable]
    pub fn remove_trading_key(&mut self, public_key: PublicKey) {
        assert_one_yocto();
        let a = env::predecessor_account_id();
        let mut keys = self.trading_keys.get(&a).cloned().unwrap_or_default();
        keys.retain(|k| k != &public_key);
        self.trading_keys.insert(a, keys);
    }

    pub fn trading_keys(&self, account_id: AccountId) -> Vec<PublicKey> {
        self.trading_keys
            .get(&account_id)
            .cloned()
            .unwrap_or_default()
    }
}

impl PerpExchange {
    pub(crate) fn has_key(&self, a: &AccountId, k: &PublicKey) -> bool {
        self.trading_keys.get(a).is_some_and(|ks| ks.contains(k))
    }
}
