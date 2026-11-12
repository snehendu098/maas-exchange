use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json};
use near_sdk::{env, near, AccountId, PromiseOrValue};

use crate::events::emit;
use crate::{PerpExchange, PerpExchangeExt};

#[near(serializers = [json])]
struct DepositMsg {
    account_id: AccountId,
}

#[near]
impl FungibleTokenReceiver for PerpExchange {
    /// USDC deposit. msg "" credits sender, `{"account_id":"x"}` credits x.
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        assert_eq!(env::predecessor_account_id(), self.usdc, "only usdc");
        let account_id = if msg.is_empty() {
            sender_id
        } else {
            serde_json::from_str::<DepositMsg>(&msg)
                .expect("bad msg")
                .account_id
        };
        let c = self.add_coll(&account_id, perp_math::to_i128(amount.0));
        emit(
            "deposited",
            json!({"account_id": account_id, "amount": amount, "collateral": c.to_string()}),
        );
        PromiseOrValue::Value(U128(0))
    }
}
