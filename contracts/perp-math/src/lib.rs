//! Fixed-point perp math. Price = USDC 1e6 per 1 base, size = base 1e8, funding rate 1e18 = 100%.
#![no_std]

pub const SIZE_UNIT: u128 = 100_000_000;
/// SIZE_UNIT * rate unit 1e18. Funding index = USDC-wei * 1e18 per 1 base.
pub const FUNDING_UNIT: u128 = 100_000_000_000_000_000_000_000_000;
pub const BPS: u128 = 10_000;

/// 128x128 -> 256 bit product as (hi, lo).
fn mul_wide(a: u128, b: u128) -> (u128, u128) {
    const M: u128 = u64::MAX as u128;
    let (a1, a0, b1, b0) = (a >> 64, a & M, b >> 64, b & M);
    let (p00, p01, p10, p11) = (a0 * b0, a0 * b1, a1 * b0, a1 * b1);
    let mid = (p00 >> 64) + (p01 & M) + (p10 & M);
    let lo = (p00 & M) | ((mid & M) << 64);
    let hi = p11 + (p01 >> 64) + (p10 >> 64) + (mid >> 64);
    (hi, lo)
}

/// floor(a * b / d) and remainder, exact via 256-bit intermediate. Panics if quotient > u128.
pub fn mul_div_rem(a: u128, b: u128, d: u128) -> (u128, u128) {
    assert!(d != 0, "div by zero");
    let (hi, lo) = mul_wide(a, b);
    if hi == 0 {
        return (lo / d, lo % d);
    }
    assert!(hi < d, "mul_div overflow");
    let (mut q, mut r) = (0u128, hi);
    for i in (0..128).rev() {
        let carry = r >> 127;
        r = (r << 1) | ((lo >> i) & 1);
        q <<= 1;
        if carry == 1 || r >= d {
            r = r.wrapping_sub(d);
            q |= 1;
        }
    }
    (q, r)
}

pub fn mul_div(a: u128, b: u128, d: u128, round_up: bool) -> u128 {
    let (q, r) = mul_div_rem(a, b, d);
    if round_up && r != 0 { q + 1 } else { q }
}

pub fn to_i128(x: u128) -> i128 {
    i128::try_from(x).expect("i128 overflow")
}

/// floor(price * |size| / 1e8).
pub fn notional(size: i128, price: u128) -> u128 {
    mul_div(size.unsigned_abs(), price, SIZE_UNIT, false)
}

/// ceil(amount * bps / 1e4). Fees, penalties.
pub fn mul_bps_up(amount: u128, bps: u128) -> u128 {
    mul_div(amount, bps, BPS, true)
}

/// IM / MM = ceil(notional(mark) * bps / 1e4).
pub fn margin(size: i128, mark: u128, bps: u128) -> u128 {
    mul_bps_up(notional(size, mark), bps)
}

/// long: notional(mark) - entry; short: entry - notional(mark).
pub fn upnl(size: i128, entry_notional: u128, mark: u128) -> i128 {
    let p = to_i128(notional(size, mark)) - to_i128(entry_notional);
    if size < 0 { -p } else { p }
}

/// Funding owed for index delta, ceiled toward +inf (against trader); negative = receives.
/// Returns (owed, dust) with dust = owed * FUNDING_UNIT - size * delta, in [0, FUNDING_UNIT).
pub fn funding(size: i128, index_delta: i128) -> (i128, u128) {
    let (q, r) = mul_div_rem(size.unsigned_abs(), index_delta.unsigned_abs(), FUNDING_UNIT);
    if (size < 0) == (index_delta < 0) {
        if r == 0 { (to_i128(q), 0) } else { (to_i128(q + 1), FUNDING_UNIT - r) }
    } else {
        (-to_i128(q), r)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn btc_long() {
        let size = 100_000_000;
        let entry = notional(size, 60_000_000_000);
        assert_eq!(entry, 60_000_000_000);
        assert_eq!(notional(size, 61_500_000_000), 61_500_000_000);
        assert_eq!(margin(size, 61_500_000_000, 500), 3_075_000_000);
        assert_eq!(margin(size, 61_500_000_000, 250), 1_537_500_000);
        assert_eq!(upnl(size, entry, 61_500_000_000), 1_500_000_000);
    }

    #[test]
    fn btc_short() {
        let (size, mark) = (-50_000_000, 62_000_100_000);
        let entry = notional(size, 60_000_000_000);
        assert_eq!(entry, 30_000_000_000);
        assert_eq!(notional(size, mark), 31_000_050_000);
        assert_eq!(margin(size, mark, 500), 1_550_002_500);
        assert_eq!(margin(size, mark, 250), 775_001_250);
        assert_eq!(upnl(size, entry, mark), -1_000_050_000);
    }

    #[test]
    fn notional_floors_margin_ceils() {
        assert_eq!(notional(-1, 3_000_000), 0);
        assert_eq!(margin(100_000_000, 1, 1), 1);
        assert_eq!(margin(50_000_000, 81, 250), 1);
        assert_eq!(mul_bps_up(100_000_000, 5), 50_000);
        assert_eq!(mul_bps_up(0, 5), 0);
    }

    #[test]
    fn funding_ceils_against_trader() {
        let d = 1_000_000_000_000_000i128 * 100_000_000_000; // 0.1% at 100k
        assert_eq!(funding(100_000_000, d), (100_000_000, 0));
        assert_eq!(funding(-100_000_000, d), (-100_000_000, 0));
        assert_eq!(funding(1, 1), (1, FUNDING_UNIT - 1));
        assert_eq!(funding(-1, 1), (0, 1));
    }

    #[test]
    fn funding_wide_no_overflow() {
        // 1e11 size * 1e30 index delta overflows i128 without 256-bit path
        let (f, dust) = funding(100_000_000_000, 1_000_000_000_000_000_000_000_000_000_000);
        assert_eq!((f, dust), (1_000_000_000_000_000, 0));
    }

    #[test]
    fn mul_div_wide_matches_naive() {
        let cases = [(u128::MAX, 3, 7), (1 << 100, 1 << 90, 1 << 95), (12345, 6789, 11), (u128::MAX, u128::MAX, u128::MAX)];
        for (a, b, d) in cases {
            let (q, r) = mul_div_rem(a, b, d);
            // check q*d + r == a*b in 256 bits
            let (h1, l1) = mul_wide(q, d);
            let (l2, c) = l1.overflowing_add(r);
            assert_eq!((h1 + c as u128, l2), mul_wide(a, b));
            assert!(r < d);
        }
        assert_eq!(mul_div(10, 1, 3, true), 4);
        assert_eq!(mul_div(9, 1, 3, true), 3);
    }
}
