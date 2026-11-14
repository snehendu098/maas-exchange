use types::Markets;

use crate::math::{margin, notional_wide};
use crate::{Account, Marks, RiskError};

// collateral + sum upnl at mark
pub fn equity(account: &Account, marks: &Marks) -> Result<i128, RiskError> {
    let mut total = account.collateral;
    for (market, pos) in account.positions() {
        let mark = marks.get(market).ok_or(RiskError::MissingMark(market))?;
        total += pos.upnl(mark);
    }
    Ok(total)
}

// im of settled positions at mark
pub fn position_im(account: &Account, markets: &Markets, marks: &Marks) -> Result<u128, RiskError> {
    let mut total = 0;
    for (market, pos) in account.positions() {
        let cfg = markets
            .get(market)
            .ok_or(RiskError::UnknownMarket(market))?;
        let mark = marks.get(market).ok_or(RiskError::MissingMark(market))?;
        total += margin(notional_wide(mark, pos.size.unsigned_abs()), cfg.imr_bps);
    }
    Ok(total)
}

// equity - position im - reserved im - pending-fill im
pub fn free_margin(account: &Account, markets: &Markets, marks: &Marks) -> Result<i128, RiskError> {
    let used = position_im(account, markets, marks)? + account.reserved_im() + account.pending_im();
    Ok(equity(account, marks)? - used as i128)
}
