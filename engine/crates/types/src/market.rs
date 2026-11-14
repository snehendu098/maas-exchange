use std::collections::BTreeMap;

use crate::{MarketId, Price, Qty, BPS_DENOM};

#[derive(Clone, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct MarketConfig {
    pub id: MarketId,
    pub symbol: String,
    pub tick: Price,
    pub lot: Qty,
    pub imr_bps: u32,
    pub mmr_bps: u32,
}

impl MarketConfig {
    pub fn max_leverage(&self) -> u32 {
        (BPS_DENOM / self.imr_bps as u64) as u32
    }

    pub fn is_valid_price(&self, price: Price) -> bool {
        price.0 > 0 && price.0.is_multiple_of(self.tick.0)
    }

    pub fn is_valid_qty(&self, qty: Qty) -> bool {
        qty.0 > 0 && qty.0.is_multiple_of(self.lot.0)
    }

    fn validate(&self) -> Result<(), MarketError> {
        let bad = self.tick.0 == 0
            || self.lot.0 == 0
            || self.mmr_bps == 0
            || self.mmr_bps > self.imr_bps
            || self.imr_bps as u64 > BPS_DENOM;
        if bad {
            return Err(MarketError::InvalidConfig(self.id));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MarketError {
    DuplicateId(MarketId),
    InvalidConfig(MarketId),
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Markets {
    by_id: BTreeMap<MarketId, MarketConfig>,
}

impl Markets {
    pub fn new(configs: Vec<MarketConfig>) -> Result<Self, MarketError> {
        let mut by_id = BTreeMap::new();
        for cfg in configs {
            cfg.validate()?;
            let id = cfg.id;
            if by_id.insert(id, cfg).is_some() {
                return Err(MarketError::DuplicateId(id));
            }
        }
        Ok(Self { by_id })
    }

    pub fn get(&self, id: MarketId) -> Option<&MarketConfig> {
        self.by_id.get(&id)
    }

    pub fn iter(&self) -> impl Iterator<Item = &MarketConfig> {
        self.by_id.values()
    }

    pub fn len(&self) -> usize {
        self.by_id.len()
    }

    pub fn is_empty(&self) -> bool {
        self.by_id.is_empty()
    }
}

// (id, symbol, tick, lot, imr_bps, mmr_bps). contract config must match
const DEFAULTS: [(u32, &str, u64, u64, u32, u32); 3] = [
    (0, "BTC", 100_000, 10_000, 500, 250),
    (1, "ETH", 10_000, 100_000, 500, 250),
    (2, "NEAR", 1_000, 1_000_000, 1_000, 500),
];

pub fn default_markets() -> Vec<MarketConfig> {
    DEFAULTS
        .iter()
        .map(|&(id, symbol, tick, lot, imr_bps, mmr_bps)| MarketConfig {
            id: MarketId(id),
            symbol: symbol.to_string(),
            tick: Price(tick),
            lot: Qty(lot),
            imr_bps,
            mmr_bps,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_load_three_markets() {
        let m = Markets::new(default_markets()).unwrap();
        let symbols: Vec<_> = m.iter().map(|c| c.symbol.as_str()).collect();
        assert_eq!(symbols, ["BTC", "ETH", "NEAR"]);
        assert_eq!(m.get(MarketId(0)).unwrap().max_leverage(), 20);
    }

    #[test]
    fn rejects_duplicate_and_invalid() {
        let mut cfgs = default_markets();
        cfgs.push(cfgs[0].clone());
        assert_eq!(
            Markets::new(cfgs),
            Err(MarketError::DuplicateId(MarketId(0)))
        );

        let mut bad = default_markets();
        bad[1].mmr_bps = 9_000;
        assert_eq!(
            Markets::new(bad),
            Err(MarketError::InvalidConfig(MarketId(1)))
        );
    }

    #[test]
    fn tick_lot_checks() {
        let btc = &default_markets()[0];
        assert!(btc.is_valid_price(Price(60_000_100_000)));
        assert!(!btc.is_valid_price(Price(60_000_050_000)));
        assert!(!btc.is_valid_price(Price(0)));
        assert!(btc.is_valid_qty(Qty(20_000)));
        assert!(!btc.is_valid_qty(Qty(15_000)));
    }
}
