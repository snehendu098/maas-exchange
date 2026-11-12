use near_sdk::json_types::{I128, U128};
use near_sdk::serde::de::DeserializeOwned;
use near_sdk::{env, near, Gas, Promise};

use crate::ext::{ext_exchange, PositionSize};
use crate::{DeltaVault, DeltaVaultExt, Snapshot, N};

const GAS_VIEW: Gas = Gas::from_tgas(5);
const GAS_CB: Gas = Gas::from_tgas(15);

fn result<T: DeserializeOwned>(i: u64) -> T {
    let bytes = env::promise_result_checked(i, 1024).expect("sync view failed");
    near_sdk::serde_json::from_slice(&bytes).expect("bad view result")
}

#[near]
impl DeltaVault {
    /// Anyone: caches vault perp equity, positions and mark prices from the exchange.
    pub fn sync(&mut self) -> Promise {
        let (ex, me) = (self.exchange.clone(), env::current_account_id());
        let view = || ext_exchange::ext(ex.clone()).with_static_gas(GAS_VIEW);
        let mut p = view().equity(me.clone());
        for i in 0..N as u32 {
            p = p.and(view().position(me.clone(), i)).and(view().price(i));
        }
        p.then(Self::ext(me).with_static_gas(GAS_CB).on_sync(self.epoch))
    }

    /// Stores snapshot unless a margin/spot op started or finished meanwhile.
    #[private]
    pub fn on_sync(&mut self, epoch: u64) -> bool {
        if epoch != self.epoch || self.in_flight != 0 {
            return false;
        }
        let mut s = Snapshot {
            perp_equity: result::<I128>(0).0,
            at_ms: env::block_timestamp_ms(),
            ..Default::default()
        };
        for i in 0..N {
            s.sizes[i] = result::<PositionSize>(1 + 2 * i as u64).size.0;
            s.prices[i] = result::<U128>(2 + 2 * i as u64).0;
        }
        self.snapshot = s;
        true
    }
}
