use std::collections::BTreeMap;

use types::{MarketId, OrderId, Price, Qty, Side, TradeId};

use crate::Position;

// im held for a resting/working order
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Reservation {
    pub market: MarketId,
    pub side: Side,
    pub price: Price,
    pub remaining: Qty,
    pub reduce_only: bool,
    pub im: u128,
}

// matched, not yet settled onchain
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct PendingFill {
    pub market: MarketId,
    pub side: Side,
    pub price: Price,
    pub qty: Qty,
    pub im: u128,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Account {
    pub(crate) collateral: i128,
    pub(crate) positions: BTreeMap<MarketId, Position>,
    pub(crate) reservations: BTreeMap<OrderId, Reservation>,
    pub(crate) pending: BTreeMap<(MarketId, TradeId), PendingFill>,
}

impl Account {
    pub fn collateral(&self) -> i128 {
        self.collateral
    }

    pub fn position(&self, market: MarketId) -> Position {
        self.positions.get(&market).copied().unwrap_or_default()
    }

    pub fn positions(&self) -> impl Iterator<Item = (MarketId, &Position)> {
        self.positions.iter().map(|(m, p)| (*m, p))
    }

    pub fn reservation(&self, order: OrderId) -> Option<&Reservation> {
        self.reservations.get(&order)
    }

    pub fn pending(&self) -> impl Iterator<Item = (&(MarketId, TradeId), &PendingFill)> {
        self.pending.iter()
    }

    pub fn reserved_im(&self) -> u128 {
        self.reservations.values().map(|r| r.im).sum()
    }

    pub fn pending_im(&self) -> u128 {
        self.pending.values().map(|p| p.im).sum()
    }

    // settled size + unsettled fills. feed this to reduce-only checks
    pub fn effective_size(&self, market: MarketId) -> i128 {
        let pending: i128 = self
            .pending
            .values()
            .filter(|p| p.market == market)
            .map(|p| p.side.sign() * p.qty.0 as i128)
            .sum();
        self.position(market).size + pending
    }
}
