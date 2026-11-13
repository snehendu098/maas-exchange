use std::collections::BTreeMap;

use types::{MarketId, Markets, OrderId, Qty};

use crate::{
    CancelError, Event, NewOrder, OrderBook, OrderStatus, PositionLookup, RejectReason, StatusKind,
};

// one book per configured market
#[derive(Clone, Debug, Default)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct Books {
    books: BTreeMap<MarketId, OrderBook>,
}

impl Books {
    pub fn new(markets: &Markets) -> Self {
        let books = markets
            .iter()
            .map(|cfg| (cfg.id, OrderBook::new(cfg.clone())))
            .collect();
        Self { books }
    }

    pub fn get(&self, market: MarketId) -> Option<&OrderBook> {
        self.books.get(&market)
    }

    pub fn submit(&mut self, order: NewOrder, positions: &impl PositionLookup) -> Vec<Event> {
        match self.books.get_mut(&order.market) {
            Some(book) => book.submit(order, positions),
            None => vec![Event::Status(OrderStatus {
                market: order.market,
                order_id: order.id,
                account: order.account,
                kind: StatusKind::Rejected(RejectReason::UnknownMarket),
                filled: Qty::ZERO,
                remaining: order.qty,
            })],
        }
    }

    pub fn cancel(&mut self, market: MarketId, id: OrderId) -> Result<Vec<Event>, CancelError> {
        self.books
            .get_mut(&market)
            .ok_or(CancelError::UnknownMarket)?
            .cancel(id)
    }
}
