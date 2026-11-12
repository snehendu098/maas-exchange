use near_sdk::AccountId;
use perp_math::FUNDING_UNIT;

use crate::events::collateral_updated;
use crate::{PerpExchange, Position};

impl PerpExchange {
    /// Charges pending funding into collateral. Payer and receiver both ceil toward +inf;
    /// exact remainder accrues as dust, whole wei swept to insurance. Zero-sum.
    pub(crate) fn settle_funding(&mut self, a: &AccountId, market_id: u32, p: &mut Position) -> i128 {
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
            collateral_updated(&ins, self.add_coll(&ins, perp_math::to_i128(dust / FUNDING_UNIT)));
        }
        self.funding_dust = dust % FUNDING_UNIT;
        f
    }
}
