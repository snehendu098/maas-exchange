use std::ops::{Add, AddAssign, Sub, SubAssign};

// usdc 1e6 per 1 whole base unit
pub const PRICE_SCALE: u64 = 1_000_000;
// base asset 1e8
pub const QTY_SCALE: u64 = 100_000_000;
pub const BPS_DENOM: u64 = 10_000;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Price(pub u64);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Qty(pub u64);

impl Qty {
    pub const ZERO: Qty = Qty(0);

    pub fn is_zero(self) -> bool {
        self.0 == 0
    }
}

impl Add for Qty {
    type Output = Qty;
    fn add(self, rhs: Qty) -> Qty {
        Qty(self.0 + rhs.0)
    }
}

impl Sub for Qty {
    type Output = Qty;
    fn sub(self, rhs: Qty) -> Qty {
        Qty(self.0 - rhs.0)
    }
}

impl AddAssign for Qty {
    fn add_assign(&mut self, rhs: Qty) {
        self.0 += rhs.0;
    }
}

impl SubAssign for Qty {
    fn sub_assign(&mut self, rhs: Qty) {
        self.0 -= rhs.0;
    }
}
