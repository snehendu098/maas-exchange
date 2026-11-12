use near_contract_standards::fungible_token::core::ext_ft_core;
use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{assert_one_yocto, env, near, AccountId, Gas, NearToken, Promise, PromiseError};

use crate::events::{collateral_updated, emit};
use crate::{PerpExchange, PerpExchangeExt};

const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_CALLBACK: Gas = Gas::from_tgas(10);

#[near]
impl PerpExchange {
    /// Only realized collateral withdrawable; post-withdraw equity must cover IM.
    /// Resolves to true if the USDC transfer landed, false if refunded.
    #[payable]
    pub fn withdraw(&mut self, amount: U128) -> Promise {
        assert_one_yocto();
        let a = env::predecessor_account_id();
        let c = self.coll(&a) - perp_math::to_i128(amount.0);
        assert!(c >= 0, "insufficient collateral");
        self.collateral.insert(a.clone(), c);
        self.require_im(&a);
        emit("withdrawn", json!({"account_id": a, "amount": amount, "collateral": c.to_string()}));
        ext_ft_core::ext(self.usdc.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(a.clone(), amount, None)
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_withdraw(a, amount))
    }

    #[private]
    pub fn on_withdraw(
        &mut self,
        account_id: AccountId,
        amount: U128,
        #[callback_result] res: Result<(), PromiseError>,
    ) -> bool {
        if res.is_ok() {
            return true;
        }
        let c = self.add_coll(&account_id, perp_math::to_i128(amount.0));
        collateral_updated(&account_id, c);
        false
    }
}
