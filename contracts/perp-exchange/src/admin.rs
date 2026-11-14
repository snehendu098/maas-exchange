use near_sdk::serde_json::json;
use near_sdk::{near, AccountId};
use perp_math::BPS;

use crate::events::emit;
use crate::{Market, PerpExchange, PerpExchangeExt, MAX_MARKETS};

#[near]
impl PerpExchange {
    pub fn set_market(&mut self, market_id: u32, market: Market) {
        self.assert_role(&self.owner.clone(), "owner");
        let (imr, mmr) = (market.imr_bps as u128, market.mmr_bps as u128);
        assert!(
            market_id < MAX_MARKETS
                && market.tick_size.0 > 0
                && market.lot_size.0 > 0
                && mmr > 0
                && mmr < imr
                && imr <= BPS
                && market.max_leverage as u128 == BPS / imr,
            "bad market"
        );
        emit(
            "market_set",
            json!({"market_id": market_id, "market": market}),
        );
        self.markets.insert(market_id, market);
    }

    pub fn set_fee_exempt(&mut self, account_id: AccountId, exempt: bool) {
        self.assert_role(&self.owner.clone(), "owner");
        if exempt {
            self.fee_exempt.insert(account_id);
        } else {
            self.fee_exempt.remove(&account_id);
        }
    }

    pub fn set_operator(&mut self, operator: AccountId) {
        self.assert_role(&self.owner.clone(), "owner");
        self.operator = operator;
    }

    pub fn set_keeper(&mut self, keeper: AccountId) {
        self.assert_role(&self.owner.clone(), "owner");
        self.keeper = keeper;
    }

    pub fn set_max_price_age(&mut self, max_price_age_ms: u64) {
        self.assert_role(&self.owner.clone(), "owner");
        assert!(max_price_age_ms > 0, "bad age");
        self.max_price_age_ms = max_price_age_ms;
    }
}
