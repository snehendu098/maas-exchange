// canonical formulas. PerpExchange must mirror exactly.
// usdc amounts 1e6. notional floors, margin requirements round up.

use types::{MarketConfig, Price, Qty, BPS_DENOM, QTY_SCALE};

// floor(price * qty / 1e8)
pub fn notional(price: Price, qty: Qty) -> u128 {
    notional_wide(price, qty.0 as u128)
}

pub fn notional_wide(price: Price, qty: u128) -> u128 {
    price.0 as u128 * qty / QTY_SCALE as u128
}

// ceil(notional * bps / 10_000)
pub fn margin(notional: u128, bps: u32) -> u128 {
    (notional * bps as u128).div_ceil(BPS_DENOM as u128)
}

pub fn initial_margin(cfg: &MarketConfig, price: Price, qty: Qty) -> u128 {
    margin(notional(price, qty), cfg.imr_bps)
}

pub fn maintenance_margin(cfg: &MarketConfig, price: Price, qty: Qty) -> u128 {
    margin(notional(price, qty), cfg.mmr_bps)
}

// long: mark_notional - entry, short: entry - mark_notional
pub fn upnl(size: i128, entry_notional: u128, mark: Price) -> i128 {
    let mark_notional = notional_wide(mark, size.unsigned_abs()) as i128;
    let entry = entry_notional as i128;
    match size.signum() {
        1 => mark_notional - entry,
        -1 => entry - mark_notional,
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notional_floors() {
        // 0.00000001 btc @ 60_000.5 usdc = 0.000600005 usdc -> 600 units
        assert_eq!(notional(Price(60_000_500_000), Qty(1)), 600);
        assert_eq!(notional(Price(1), Qty(99_999_999)), 0);
    }

    #[test]
    fn margin_rounds_up() {
        assert_eq!(margin(10_001, 500), 501);
        assert_eq!(margin(10_000, 500), 500);
        assert_eq!(margin(0, 500), 0);
    }

    #[test]
    fn upnl_signs() {
        let entry = notional(Price(100_000_000), Qty(100_000_000));
        assert_eq!(upnl(100_000_000, entry, Price(110_000_000)), 10_000_000);
        assert_eq!(upnl(-100_000_000, entry, Price(110_000_000)), -10_000_000);
        assert_eq!(upnl(0, 0, Price(1)), 0);
    }
}
