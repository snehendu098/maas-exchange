use std::collections::BTreeMap;

use types::{MarketId, Price};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Marks(BTreeMap<MarketId, Price>);

impl Marks {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set(&mut self, market: MarketId, price: Price) {
        self.0.insert(market, price);
    }

    pub fn get(&self, market: MarketId) -> Option<Price> {
        self.0.get(&market).copied()
    }
}

impl FromIterator<(MarketId, Price)> for Marks {
    fn from_iter<I: IntoIterator<Item = (MarketId, Price)>>(iter: I) -> Self {
        Self(iter.into_iter().collect())
    }
}
