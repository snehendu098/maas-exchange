use types::{Price, Qty, Side};

use crate::math::{notional, notional_wide, upnl};

// size: signed base 1e8, long > 0. entry_notional: usdc cost basis
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Position {
    pub size: i128,
    pub entry_notional: u128,
}

impl Position {
    pub fn is_flat(&self) -> bool {
        self.size == 0
    }

    pub fn upnl(&self, mark: Price) -> i128 {
        upnl(self.size, self.entry_notional, mark)
    }

    // apply fill, return realized pnl. close part takes pro-rata entry (floor)
    pub fn apply(&mut self, side: Side, price: Price, qty: Qty) -> i128 {
        let sign = side.sign();
        let open = opening_qty(self.size, side, qty);
        let close = qty.0 as u128 - open.0 as u128;
        let mut realized = 0;
        if close > 0 {
            let abs = self.size.unsigned_abs();
            let entry_part = self.entry_notional * close / abs;
            let exit = notional_wide(price, close) as i128;
            realized = (exit - entry_part as i128) * self.size.signum();
            self.entry_notional -= entry_part;
            self.size += sign * close as i128;
        }
        if open.0 > 0 {
            self.size += sign * open.0 as i128;
            self.entry_notional += notional(price, open);
        }
        realized
    }
}

// part of a fill that adds exposure vs current signed size
pub fn opening_qty(size: i128, side: Side, qty: Qty) -> Qty {
    if size == 0 || size.signum() == side.sign() {
        return qty;
    }
    let close = size.unsigned_abs().min(qty.0 as u128) as u64;
    Qty(qty.0 - close)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ONE: u64 = 100_000_000;

    #[test]
    fn open_add_close_flip() {
        let mut p = Position::default();
        assert_eq!(p.apply(Side::Buy, Price(100_000_000), Qty(ONE)), 0);
        assert_eq!(p.apply(Side::Buy, Price(200_000_000), Qty(ONE)), 0);
        assert_eq!(p.entry_notional, 300_000_000);

        // close half at 250: exit 250 - entry 150
        assert_eq!(
            p.apply(Side::Sell, Price(250_000_000), Qty(ONE)),
            100_000_000
        );
        assert_eq!(p.size, ONE as i128);

        // flip: close 1 @ 50 (loss 100), open short 1 @ 50
        let r = p.apply(Side::Sell, Price(50_000_000), Qty(2 * ONE));
        assert_eq!(r, -100_000_000);
        assert_eq!(
            p,
            Position {
                size: -(ONE as i128),
                entry_notional: 50_000_000
            }
        );
    }

    #[test]
    fn opening_portion() {
        assert_eq!(opening_qty(0, Side::Sell, Qty(5)), Qty(5));
        assert_eq!(opening_qty(10, Side::Buy, Qty(5)), Qty(5));
        assert_eq!(opening_qty(10, Side::Sell, Qty(5)), Qty(0));
        assert_eq!(opening_qty(10, Side::Sell, Qty(15)), Qty(5));
        assert_eq!(opening_qty(-10, Side::Buy, Qty(15)), Qty(5));
    }
}
