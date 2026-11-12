use near_sdk::serde_json::json;
use near_sdk::{env, near};

use crate::events::emit;
use crate::{DeltaVault, DeltaVaultExt, Mode, N};

#[near]
impl DeltaVault {
    /// Keeper only. One change per market per cooldown_ms (first change free).
    pub fn set_mode(&mut self, market: u32, mode: Mode, reason_ref: String) {
        self.assert_role(&self.keeper.clone(), "keeper");
        let i = market as usize;
        assert!(i < N, "bad market");
        assert!(self.mode[i] != mode, "same mode");
        let (last, now) = (self.last_mode_change_ms[i], env::block_timestamp_ms());
        assert!(last == 0 || now >= last + self.cfg.cooldown_ms, "cooldown");
        self.mode[i] = mode;
        self.last_mode_change_ms[i] = now;
        emit(
            "mode_changed",
            json!({"market": market, "mode": mode, "reason_ref": reason_ref}),
        );
    }
}
