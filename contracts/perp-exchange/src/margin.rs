use near_sdk::AccountId;
use perp_math::{funding, margin, to_i128, upnl};

use crate::events::collateral_updated;
use crate::{PerpExchange, MAX_MARKETS};

impl PerpExchange {
    /// (equity, im, mm): equity = collateral + sum upnl - pending funding, margins at mark.
    pub(crate) fn health(&self, a: &AccountId) -> (i128, u128, u128) {
        let (mut eq, mut im, mut mm) = (self.coll(a), 0u128, 0u128);
        for i in 0..MAX_MARKETS {
            let p = self.pos(a, i);
            if p.size == 0 {
                continue;
            }
            let m = self.mkt(i);
            let mark = self.mark(i);
            eq += upnl(p.size, p.entry_notional, mark)
                - funding(p.size, self.findex(i) - p.last_funding_index).0;
            im += margin(p.size, mark, m.imr_bps as u128);
            mm += margin(p.size, mark, m.mmr_bps as u128);
        }
        (eq, im, mm)
    }

    pub(crate) fn require_im(&self, a: &AccountId) {
        let (eq, im, _) = self.health(a);
        assert!(eq >= to_i128(im), "below initial margin");
    }

    /// Post-fill: growth needs IM. Reduce leaving collateral < 0: flat -> write off, else needs MM.
    pub(crate) fn check_side(&mut self, a: &AccountId, reduced: bool) {
        if !reduced {
            return self.require_im(a);
        }
        if self.coll(a) >= 0 || self.write_off(a) != 0 {
            return;
        }
        let (eq, _, mm) = self.health(a);
        assert!(eq >= to_i128(mm), "below maintenance margin");
    }

    /// Flat account with collateral < 0: insurance absorbs it. Returns bad debt written off.
    pub(crate) fn write_off(&mut self, a: &AccountId) -> u128 {
        let c = self.coll(a);
        if c >= 0 || a == &self.insurance || self.has_position(a) {
            return 0;
        }
        self.collateral.insert(a.clone(), 0);
        let ins = self.insurance.clone();
        collateral_updated(&ins, self.add_coll(&ins, c));
        collateral_updated(a, 0);
        c.unsigned_abs()
    }

    fn has_position(&self, a: &AccountId) -> bool {
        (0..MAX_MARKETS).any(|i| self.pos(a, i).size != 0)
    }
}
