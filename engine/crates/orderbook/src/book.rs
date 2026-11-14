use std::collections::BTreeMap;

use types::{AccountId, MarketConfig, OrderId, Price, Qty, Side};

use crate::level::Level;
use crate::{BookDelta, CancelError, CancelReason, Event, OrderStatus, RestingOrder, StatusKind};

#[derive(Clone, Debug)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct OrderBook {
    pub(crate) config: MarketConfig,
    bids: BTreeMap<Price, Level>,
    asks: BTreeMap<Price, Level>,
    index: BTreeMap<OrderId, (Side, Price)>,
    next_trade: u64,
}

impl OrderBook {
    pub fn new(config: MarketConfig) -> Self {
        Self {
            config,
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
            index: BTreeMap::new(),
            next_trade: 0,
        }
    }

    pub fn config(&self) -> &MarketConfig {
        &self.config
    }

    pub fn best_bid(&self) -> Option<Price> {
        self.bids.keys().next_back().copied()
    }

    pub fn best_ask(&self) -> Option<Price> {
        self.asks.keys().next().copied()
    }

    // best price first
    pub fn depth(&self, side: Side) -> Vec<(Price, Qty)> {
        let level = |(p, l): (&Price, &Level)| (*p, l.total);
        match side {
            Side::Buy => self.bids.iter().rev().map(level).collect(),
            Side::Sell => self.asks.iter().map(level).collect(),
        }
    }

    pub fn order(&self, id: OrderId) -> Option<&RestingOrder> {
        let (side, price) = self.index.get(&id)?;
        self.levels(*side)[price].orders.iter().find(|o| o.id == id)
    }

    pub fn contains(&self, id: OrderId) -> bool {
        self.index.contains_key(&id)
    }

    pub fn cancel(&mut self, id: OrderId) -> Result<Vec<Event>, CancelError> {
        let (side, price) = *self.index.get(&id).ok_or(CancelError::UnknownOrder)?;
        let mut events = Vec::new();
        self.cancel_resting(side, price, id, CancelReason::User, &mut events);
        Ok(events)
    }

    pub(crate) fn best_opposite(&self, side: Side) -> Option<Price> {
        match side {
            Side::Buy => self.best_ask(),
            Side::Sell => self.best_bid(),
        }
    }

    pub(crate) fn front(&self, side: Side, price: Price) -> Option<RestingOrder> {
        self.levels(side).get(&price)?.orders.front().copied()
    }

    pub(crate) fn rest(&mut self, order: RestingOrder) -> Event {
        self.index.insert(order.id, (order.side, order.price));
        let (side, price) = (order.side, order.price);
        self.levels_mut(side).entry(price).or_default().push(order);
        self.delta(side, price)
    }

    // fill head of level by qty; returns updated maker
    pub(crate) fn fill_front(&mut self, side: Side, price: Price, qty: Qty) -> RestingOrder {
        let levels = self.levels_mut(side);
        let level = levels.get_mut(&price).expect("level exists");
        let maker = level.orders.front_mut().expect("level non-empty");
        maker.remaining -= qty;
        maker.filled += qty;
        level.total -= qty;
        let snapshot = *maker;
        if snapshot.remaining.is_zero() {
            level.orders.pop_front();
            if level.is_empty() {
                levels.remove(&price);
            }
            self.index.remove(&snapshot.id);
        }
        snapshot
    }

    pub(crate) fn cancel_resting(
        &mut self,
        side: Side,
        price: Price,
        id: OrderId,
        reason: CancelReason,
        events: &mut Vec<Event>,
    ) {
        let levels = self.levels_mut(side);
        let Some(level) = levels.get_mut(&price) else {
            return;
        };
        let Some(order) = level.remove(id) else {
            return;
        };
        if level.is_empty() {
            levels.remove(&price);
        }
        self.index.remove(&id);
        events.push(self.delta(side, price));
        events.push(self.status(
            order.id,
            order.account,
            StatusKind::Cancelled(reason),
            order.filled,
            order.remaining,
        ));
    }

    pub(crate) fn next_trade_id(&mut self) -> u64 {
        self.next_trade += 1;
        self.next_trade
    }

    pub(crate) fn delta(&self, side: Side, price: Price) -> Event {
        let qty = self.levels(side).get(&price).map_or(Qty::ZERO, |l| l.total);
        Event::Delta(BookDelta {
            market: self.config.id,
            side,
            price,
            qty,
        })
    }

    pub(crate) fn status(
        &self,
        order_id: OrderId,
        account: AccountId,
        kind: StatusKind,
        filled: Qty,
        remaining: Qty,
    ) -> Event {
        Event::Status(OrderStatus {
            market: self.config.id,
            order_id,
            account,
            kind,
            filled,
            remaining,
        })
    }

    fn levels(&self, side: Side) -> &BTreeMap<Price, Level> {
        match side {
            Side::Buy => &self.bids,
            Side::Sell => &self.asks,
        }
    }

    fn levels_mut(&mut self, side: Side) -> &mut BTreeMap<Price, Level> {
        match side {
            Side::Buy => &mut self.bids,
            Side::Sell => &mut self.asks,
        }
    }
}
