use near_sdk::json_types::I128;
use near_sdk::serde_json::json;
use near_sdk::{near, AccountId};
use perp_math::{to_i128, FUNDING_UNIT};

use crate::events::{collateral_updated, emit};
use crate::{PerpExchange, PerpExchangeExt, Position};

pub const MAX_FUNDING_RATE: i128 = 10_000_000_000_000_000; // 1% per update

#[near]
impl PerpExchange {
    /// Keeper only. index += rate * mark.
    pub fn update_funding(&mut self, market_id: u32, rate: I128) {
        self.assert_role(&self.keeper.clone(), "keeper");
        assert!(rate.0.abs() <= MAX_FUNDING_RATE, "rate too high");
        self.mkt(market_id);
        let price = self.mark(market_id);
        let idx = self.findex(market_id) + rate.0 * to_i128(price);
        self.funding_index.insert(market_id, idx);
        emit(
            "funding_updated",
            json!({"market_id": market_id, "rate": rate, "price": price.to_string(), "index": idx.to_string()}),
        );
    }
}

impl PerpExchange {
    /// Charges pending funding into collateral. Payer and receiver both ceil toward +inf;
    /// exact remainder accrues as dust, whole wei swept to insurance. Zero-sum.
    pub(crate) fn settle_funding(
        &mut self,
        a: &AccountId,
        market_id: u32,
        p: &mut Position,
    ) -> i128 {
        let idx = self.findex(market_id);
        let delta = idx - p.last_funding_index;
        p.last_funding_index = idx;
        if delta == 0 || p.size == 0 {
            return 0;
        }
        let (f, dust) = perp_math::funding(p.size, delta);
        self.add_coll(a, -f);
        let dust = self.funding_dust + dust;
        if dust >= FUNDING_UNIT {
            let ins = self.insurance.clone();
            collateral_updated(&ins, self.add_coll(&ins, to_i128(dust / FUNDING_UNIT)));
        }
        self.funding_dust = dust % FUNDING_UNIT;
        f
    }
}
