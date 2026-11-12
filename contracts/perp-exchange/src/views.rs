use near_sdk::json_types::{I128, U128};
use near_sdk::{near, AccountId};

use crate::{Margins, Market, PerpExchange, PerpExchangeExt, PositionView};

#[near]
impl PerpExchange {
    pub fn position(&self, account_id: AccountId, market_id: u32) -> PositionView {
        self.pos(&account_id, market_id).into()
    }

    pub fn collateral(&self, account_id: AccountId) -> I128 {
        self.coll(&account_id).into()
    }

    pub fn equity(&self, account_id: AccountId) -> I128 {
        self.health(&account_id).0.into()
    }

    /// Total initial + maintenance margin across markets at mark.
    pub fn margins(&self, account_id: AccountId) -> Margins {
        let (_, im, mm) = self.health(&account_id);
        Margins {
            im: im.into(),
            mm: mm.into(),
        }
    }

    pub fn market(&self, market_id: u32) -> Option<Market> {
        self.markets.get(&market_id).cloned()
    }

    pub fn funding_index(&self, market_id: u32) -> I128 {
        self.findex(market_id).into()
    }

    pub fn fee_exempt(&self, account_id: AccountId) -> bool {
        self.fee_exempt.contains(&account_id)
    }

    pub fn funding_dust(&self) -> U128 {
        self.funding_dust.into()
    }

    pub fn max_price_age_ms(&self) -> u64 {
        self.max_price_age_ms
    }

    pub fn owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn operator(&self) -> AccountId {
        self.operator.clone()
    }

    pub fn keeper(&self) -> AccountId {
        self.keeper.clone()
    }

    pub fn fee_recipient(&self) -> AccountId {
        self.fee_recipient.clone()
    }

    pub fn insurance(&self) -> AccountId {
        self.insurance.clone()
    }

    pub fn usdc(&self) -> AccountId {
        self.usdc.clone()
    }
}
