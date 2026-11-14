use std::collections::VecDeque;

use types::{OrderId, Qty};

use crate::RestingOrder;

// fifo queue at one price = time priority
#[derive(Clone, Debug, Default)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub(crate) struct Level {
    pub orders: VecDeque<RestingOrder>,
    pub total: Qty,
}

impl Level {
    pub fn push(&mut self, order: RestingOrder) {
        self.total += order.remaining;
        self.orders.push_back(order);
    }

    pub fn remove(&mut self, id: OrderId) -> Option<RestingOrder> {
        let idx = self.orders.iter().position(|o| o.id == id)?;
        let order = self.orders.remove(idx)?;
        self.total -= order.remaining;
        Some(order)
    }

    pub fn is_empty(&self) -> bool {
        self.orders.is_empty()
    }
}
