use crate::app::{ChainUpdate, Engine, Output};

impl Engine {
    // chain = source of truth: overwrite engine view, no outputs
    pub(crate) fn apply_chain(&mut self, update: ChainUpdate) -> Vec<Output> {
        match update {
            ChainUpdate::Balance {
                account,
                collateral,
                block,
            } => self.risk.set_collateral(account, collateral, block),
            ChainUpdate::Position {
                account,
                market,
                position,
                block,
            } => self.risk.set_position(account, market, position, block),
            ChainUpdate::Mark { market, price } => self.marks.set(market, price),
        }
        Vec::new()
    }
}
