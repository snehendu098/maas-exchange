use near_sdk::serde_json::json;
use near_sdk::{env, near, AccountId};
use perp_math::{mul_bps_up, notional, to_i128};

use crate::events::{collateral_updated, emit};
use crate::{PerpExchange, PerpExchangeExt};

#[near]
impl PerpExchange {
    /// Keeper only. Moves position to insurance at mark; penalty = MM/2 of closed notional,
    /// capped at collateral. Bad debt written off only once account is flat.
    pub fn liquidate(&mut self, account_id: AccountId, market_id: u32) {
        self.assert_role(&self.keeper.clone(), "keeper");
        let m = self.mkt(market_id);
        let size = self.pos(&account_id, market_id).size;
        assert!(account_id != self.insurance && size != 0, "not liquidatable");
        let (eq, _, mm) = self.health(&account_id);
        assert!(eq < to_i128(mm), "not liquidatable");

        let price = self.mark(market_id);
        let (abs, close_is_buy, ins) = (size.unsigned_abs(), size < 0, self.insurance.clone());
        self.trade(&account_id, market_id, close_is_buy, abs, price, 0, false);
        self.trade(&ins, market_id, !close_is_buy, abs, price, 0, false);
        let (penalty, bad_debt) = self.penalize(&account_id, notional(size, price), m.mmr_bps as u128);
        emit(
            "liquidated",
            json!({
                "account_id": account_id, "market_id": market_id, "liquidator": env::predecessor_account_id(),
                "price": price.to_string(), "size": size.to_string(),
                "penalty": penalty.to_string(), "bad_debt": bad_debt.to_string(),
            }),
        );
    }
}

impl PerpExchange {
    fn penalize(&mut self, a: &AccountId, notional: u128, mmr_bps: u128) -> (u128, u128) {
        let c = self.coll(a);
        let penalty = mul_bps_up(notional, mmr_bps / 2).min(c.max(0) as u128);
        self.collateral.insert(a.clone(), c - to_i128(penalty));
        let ins = self.insurance.clone();
        collateral_updated(&ins, self.add_coll(&ins, to_i128(penalty)));
        let bad_debt = self.write_off(a);
        collateral_updated(a, self.coll(a));
        (penalty, bad_debt)
    }
}
