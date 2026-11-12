use near_sdk::serde_json::json;
use near_sdk::{near, AccountId};
use perp_math::{mul_bps_up, mul_div, notional, to_i128};

use crate::events::{collateral_updated, emit};
use crate::orders::{to_hex, Fill};
use crate::{PerpExchange, PerpExchangeExt, Position};

#[near]
impl PerpExchange {
    /// Operator only. Any failing fill reverts the whole batch.
    pub fn settle(&mut self, fills: Vec<Fill>) {
        self.assert_role(&self.operator.clone(), "operator");
        for f in &fills {
            self.fill(f);
        }
    }
}

impl PerpExchange {
    fn fill(&mut self, f: &Fill) {
        let (mk, tk) = (&f.maker, &f.taker);
        assert_eq!(mk.market_id, tk.market_id, "market mismatch");
        assert!(mk.is_buy != tk.is_buy, "same side");
        assert!(mk.trader != tk.trader, "self trade");
        let m = self.mkt(mk.market_id);
        let (price, size) = (f.price.0, f.size.0);
        assert!(size > 0 && size % m.lot_size.0 == 0, "off lot");
        assert!(price > 0 && price % m.tick_size.0 == 0, "off tick");
        let mh = self.use_order(mk, &f.maker_key, &f.maker_sig.0, price, size);
        let th = self.use_order(tk, &f.taker_key, &f.taker_sig.0, price, size);

        let (m_red, maker_fee) = self.trade(&mk.trader, mk.market_id, mk.is_buy, size, price, m.maker_fee_bps, mk.reduce_only);
        let (t_red, taker_fee) = self.trade(&tk.trader, tk.market_id, tk.is_buy, size, price, m.taker_fee_bps, tk.reduce_only);
        if maker_fee + taker_fee != 0 {
            let fr = self.fee_recipient.clone();
            collateral_updated(&fr, self.add_coll(&fr, to_i128(maker_fee + taker_fee)));
        }
        self.check_side(&mk.trader, m_red);
        self.check_side(&tk.trader, t_red);
        emit(
            "traded",
            json!({
                "market_id": mk.market_id, "maker_order_hash": to_hex(&mh), "taker_order_hash": to_hex(&th),
                "maker": mk.trader, "taker": tk.trader, "taker_is_buy": tk.is_buy,
                "price": f.price, "size": f.size,
                "maker_fee": maker_fee.to_string(), "taker_fee": taker_fee.to_string(),
            }),
        );
    }

    /// One side of a trade; exempt pays 0 fee. Returns (only reduced position, fee charged).
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn trade(
        &mut self,
        a: &AccountId,
        market_id: u32,
        is_buy: bool,
        size: u128,
        price: u128,
        fee_bps: u32,
        reduce_only: bool,
    ) -> (bool, u128) {
        let mut p = self.pos(a, market_id);
        let funding_paid = self.settle_funding(a, market_id, &mut p);
        let reduced = p.size != 0 && (p.size > 0) != is_buy && size <= p.size.unsigned_abs();
        assert!(!reduce_only || reduced, "reduce only");
        let q = notional(to_i128(size), price);
        let fee = if self.fee_exempt.contains(a) { 0 } else { mul_bps_up(q, fee_bps as u128) };
        let pnl = apply_fill(&mut p, is_buy, size, price, q);
        self.positions.insert((a.clone(), market_id), p);
        let c = self.add_coll(a, pnl - to_i128(fee));
        emit(
            "position_updated",
            json!({
                "account_id": a, "market_id": market_id, "size": p.size.to_string(),
                "entry_notional": p.entry_notional.to_string(), "funding_index": p.last_funding_index.to_string(),
                "realized_pnl": pnl.to_string(), "funding_paid": funding_paid.to_string(), "collateral": c.to_string(),
            }),
        );
        (reduced, fee)
    }
}

/// Updates size + basis, returns realized pnl. Close basis rounds against trader
/// (long ceil, short floor); open/close notional split exactly so cash is conserved.
fn apply_fill(p: &mut Position, is_buy: bool, size: u128, price: u128, q: u128) -> i128 {
    let old = p.size;
    let old_abs = old.unsigned_abs();
    let mut pnl = 0;
    if old == 0 || (old > 0) == is_buy {
        p.entry_notional += q;
    } else {
        let closed = size.min(old_abs);
        let q_close = if closed == size { q } else { notional(to_i128(closed), price) };
        let basis = mul_div(p.entry_notional, closed, old_abs, old > 0);
        pnl = if old > 0 { to_i128(q_close) - to_i128(basis) } else { to_i128(basis) - to_i128(q_close) };
        p.entry_notional = p.entry_notional - basis + (q - q_close);
    }
    p.size = if is_buy { old + to_i128(size) } else { old - to_i128(size) };
    pnl
}
