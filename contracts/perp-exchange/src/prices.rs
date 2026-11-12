use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near};

use crate::events::emit;
use crate::{PerpExchange, PerpExchangeExt, PricePoint};

#[near]
impl PerpExchange {
    /// Keeper pushes (market_id, price 1e6, publish_ms). Non-newer points are skipped.
    pub fn push_prices(&mut self, prices: Vec<(u32, U128, u64)>) {
        self.assert_role(&self.keeper.clone(), "keeper");
        for (market_id, price, publish_ms) in prices {
            self.mkt(market_id);
            assert!(price.0 > 0, "bad price");
            assert!(publish_ms <= env::block_timestamp_ms(), "future price");
            if self.prices.get(&market_id).is_some_and(|p| p.publish_ms >= publish_ms) {
                continue;
            }
            self.prices.insert(market_id, PricePoint { price: price.0, publish_ms });
            emit("price_pushed", json!({"market_id": market_id, "price": price, "publish_ms": publish_ms}));
        }
    }

    /// Mark price; panics if missing or older than max_price_age_ms.
    pub fn price(&self, market_id: u32) -> U128 {
        U128(self.mark(market_id))
    }
}

impl PerpExchange {
    pub(crate) fn mark(&self, market_id: u32) -> u128 {
        let p = self.prices.get(&market_id).expect("no price");
        assert!(env::block_timestamp_ms() <= p.publish_ms + self.max_price_age_ms, "stale price");
        p.price
    }
}
