use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, AccountId, PromiseOrValue};

use crate::events::emit;
use crate::{DeltaVault, DeltaVaultExt};

#[near]
impl FungibleTokenReceiver for DeltaVault {
    /// USDC deposit: mints shares at NAV for sender. Panic refunds the transfer.
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let _ = msg;
        assert_eq!(env::predecessor_account_id(), self.usdc, "only usdc");
        let nav = self.fresh_nav();
        let shares = self.to_shares(amount.0, nav);
        assert!(shares > 0, "zero shares");
        self.idle += amount.0;
        self.mint(&sender_id, shares);
        emit(
            "deposited",
            json!({"account_id": sender_id, "assets": amount, "shares": shares.to_string()}),
        );
        PromiseOrValue::Value(U128(0))
    }
}
