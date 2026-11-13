use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::serde_json::json;
use near_sdk::{env, near, AccountId, CryptoHash, PublicKey};

use crate::events::emit;
use crate::{PerpExchange, PerpExchangeExt};

/// Signed by a trading key: ed25519 over sha256(borsh(Order)). nonce is salt only.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Order {
    pub trader: AccountId,
    pub market_id: u32,
    pub is_buy: bool,
    pub price: U128,
    pub size: U128,
    pub reduce_only: bool,
    pub nonce: u64,
    pub expiry_ms: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct Fill {
    pub maker: Order,
    pub taker: Order,
    pub maker_key: PublicKey,
    pub maker_sig: Base64VecU8,
    pub taker_key: PublicKey,
    pub taker_sig: Base64VecU8,
    pub price: U128,
    pub size: U128,
}

pub fn hash(o: &Order) -> CryptoHash {
    env::sha256_array(near_sdk::borsh::to_vec(o).unwrap())
}

pub fn to_hex(h: &CryptoHash) -> String {
    h.iter().map(|b| format!("{b:02x}")).collect()
}

fn from_hex(s: &str) -> CryptoHash {
    assert!(s.len() == 64, "bad hash");
    let mut h = [0u8; 32];
    for (i, b) in h.iter_mut().enumerate() {
        *b = u8::from_str_radix(&s[2 * i..2 * i + 2], 16).expect("bad hash");
    }
    h
}

#[near]
impl PerpExchange {
    pub fn cancel(&mut self, order: Order) {
        assert_eq!(env::predecessor_account_id(), order.trader, "not trader");
        let h = hash(&order);
        self.cancelled.insert(h);
        emit("order_cancelled", json!({"trader": order.trader, "order_hash": to_hex(&h)}));
    }

    pub fn order_hash(&self, order: Order) -> String {
        to_hex(&hash(&order))
    }

    pub fn filled(&self, order_hash: String) -> U128 {
        U128(self.filled.get(&from_hex(&order_hash)).copied().unwrap_or(0))
    }

    pub fn cancelled(&self, order_hash: String) -> bool {
        self.cancelled.contains(&from_hex(&order_hash))
    }
}

impl PerpExchange {
    /// Validates order + sig, books fill size. Returns order hash.
    pub(crate) fn use_order(&mut self, o: &Order, key: &PublicKey, sig: &[u8], price: u128, size: u128) -> CryptoHash {
        assert!(env::block_timestamp_ms() <= o.expiry_ms, "expired");
        let h = hash(o);
        assert!(!self.cancelled.contains(&h), "cancelled");
        assert!(if o.is_buy { price <= o.price.0 } else { price >= o.price.0 }, "worse than limit");
        let nf = self.filled.get(&h).copied().unwrap_or(0) + size;
        assert!(nf <= o.size.0, "overfill");
        assert!(self.has_key(&o.trader, key), "unknown key");
        let sig: [u8; 64] = sig.try_into().expect("bad signature");
        let pk: [u8; 32] = key.as_bytes()[1..].try_into().unwrap();
        assert!(env::ed25519_verify(&sig, &h, &pk), "bad signature");
        self.filled.insert(h, nf);
        h
    }
}
