use near_sdk::json_types::{I128, U128};
use near_sdk::{ext_contract, near, AccountId, PublicKey};

#[near(serializers = [json])]
pub struct PositionSize {
    pub size: I128,
}

#[near(serializers = [json])]
pub struct RefSwapAction {
    pub pool_id: u64,
    pub token_in: AccountId,
    pub amount_in: Option<U128>,
    pub token_out: AccountId,
    pub min_amount_out: U128,
}

#[allow(dead_code)]
#[ext_contract(ext_exchange)]
pub trait Exchange {
    fn equity(&self, account_id: AccountId) -> I128;
    fn position(&self, account_id: AccountId, market_id: u32) -> PositionSize;
    fn price(&self, market_id: u32) -> U128;
    fn withdraw(&mut self, amount: U128) -> bool;
    fn add_trading_key(&mut self, public_key: PublicKey);
}

#[allow(dead_code)]
#[ext_contract(ext_ref)]
pub trait RefExchange {
    fn swap(&mut self, actions: Vec<RefSwapAction>, referral_id: Option<AccountId>) -> U128;
    fn withdraw(&mut self, token_id: AccountId, amount: U128, unregister: Option<bool>);
}
