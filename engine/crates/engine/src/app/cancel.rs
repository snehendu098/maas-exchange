use orderbook::CancelError;
use types::Qty;

use crate::app::{CancelOrder, Cause, Engine, Output, Rejection};

impl Engine {
    pub(crate) fn cancel(&mut self, cmd: CancelOrder) -> Vec<Output> {
        if let Err(cause) = self.check_owner(&cmd) {
            return vec![Output::Rejected(Rejection {
                market: cmd.market,
                order_id: cmd.order,
                account: cmd.account,
                cause,
                remaining: Qty::ZERO,
            })];
        }
        let events = self
            .books
            .cancel(cmd.market, cmd.order)
            .expect("owner check found order");
        self.book_outputs(events)
    }

    fn check_owner(&self, cmd: &CancelOrder) -> Result<(), Cause> {
        let book = self
            .books
            .get(cmd.market)
            .ok_or(Cause::Cancel(CancelError::UnknownMarket))?;
        let order = book
            .order(cmd.order)
            .ok_or(Cause::Cancel(CancelError::UnknownOrder))?;
        if order.account != cmd.account {
            return Err(Cause::NotOwner);
        }
        Ok(())
    }
}
