use near_contract_standards::fungible_token::core::ext_ft_core;
use near_sdk::json_types::U128;
use near_sdk::{env, near, Gas, NearToken, Promise, PromiseError, PublicKey};

use crate::ext::ext_exchange;
use crate::spot::used_amount;
use crate::{DeltaVault, DeltaVaultExt};

const GAS_EX: Gas = Gas::from_tgas(50);
const GAS_CB: Gas = Gas::from_tgas(10);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[near]
impl DeltaVault {
    /// Keeper: unreserved idle USDC -> exchange collateral.
    pub fn deposit_margin(&mut self, amount: U128) -> Promise {
        self.assert_role(&self.keeper.clone(), "keeper");
        let nav = self.fresh_nav();
        assert!(amount.0 <= self.available(nav), "reserved");
        self.idle -= amount.0;
        self.begin_op();
        ext_ft_core::ext(self.usdc.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_EX)
            .ft_transfer_call(self.exchange.clone(), amount, None, String::new())
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CB)
                    .on_margin_deposit(amount),
            )
    }

    /// Credits snapshot equity by used amount so NAV stays valid without re-sync.
    #[private]
    pub fn on_margin_deposit(&mut self, amount: U128) -> U128 {
        self.end_op();
        let used = used_amount();
        self.idle += amount.0 - used;
        self.snapshot.perp_equity += perp_math::to_i128(used);
        U128(used)
    }

    /// Keeper: exchange collateral -> idle. Exchange enforces IM.
    pub fn withdraw_margin(&mut self, amount: U128) -> Promise {
        self.assert_role(&self.keeper.clone(), "keeper");
        self.begin_op();
        ext_exchange::ext(self.exchange.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_EX)
            .withdraw(amount)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CB)
                    .on_margin_withdraw(amount),
            )
    }

    #[private]
    pub fn on_margin_withdraw(
        &mut self,
        amount: U128,
        #[callback_result] res: Result<bool, PromiseError>,
    ) -> bool {
        self.end_op();
        let ok = res.unwrap_or(false);
        if ok {
            self.idle += amount.0;
            self.snapshot.perp_equity -= perp_math::to_i128(amount.0);
        }
        ok
    }

    /// Owner: registers key on exchange so keeper can sign vault orders.
    pub fn add_vault_trading_key(&mut self, public_key: PublicKey) -> Promise {
        self.assert_role(&self.owner.clone(), "owner");
        ext_exchange::ext(self.exchange.clone())
            .with_attached_deposit(ONE_YOCTO)
            .add_trading_key(public_key)
    }
}
