use types::{MarketId, TradeId};

use crate::app::{Engine, Output, SettleResult};

impl Engine {
    // ok -> pending into position; failed -> drop pending, frees its im. unknown ids ignored
    pub(crate) fn apply_settle(&mut self, result: SettleResult) -> Vec<Output> {
        for (market, trade) in result.settled {
            self.resolve(market, trade, Some(result.block));
        }
        for (market, trade) in result.failed {
            self.resolve(market, trade, None);
        }
        Vec::new()
    }

    // mined = Some(block) when settled, None when failed
    fn resolve(&mut self, market: MarketId, trade: TradeId, mined: Option<u64>) {
        let Some((maker, taker)) = self.unsettled.remove(&(market, trade)) else {
            return;
        };
        for account in [maker, taker] {
            let res = match mined {
                Some(block) => self.risk.settle(&account, market, trade, block).map(drop),
                None => self.risk.discard(&account, market, trade),
            };
            res.expect("unsettled implies pending on both legs");
        }
    }
}
