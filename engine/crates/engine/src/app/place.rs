use orderbook::{NewOrder, OrderBook};
use risk::OrderIntent;
use types::{AccountId, MarketId, OrderId, OrderType, Price, Side};

use crate::app::{Cause, Engine, Output, PlaceOrder, Rejection};

impl Engine {
    pub(crate) fn place(&mut self, id: OrderId, cmd: PlaceOrder) -> Vec<Output> {
        let order = cmd.with_id(id);
        let intent = OrderIntent {
            id,
            market: order.market,
            side: order.side,
            price: self.reserve_price(&order),
            qty: order.qty,
            reduce_only: order.reduce_only,
        };
        if let Err(err) = self
            .risk
            .check_and_reserve(order.account, &intent, &self.marks)
        {
            return vec![Output::Rejected(Rejection {
                market: order.market,
                order_id: id,
                account: order.account,
                cause: Cause::Risk(err),
                remaining: order.qty,
            })];
        }
        let risk = &self.risk;
        let positions =
            |a: &AccountId, m: MarketId| risk.account(a).map_or(0, |acct| acct.effective_size(m));
        let events = self.books.submit(order, &positions);
        self.book_outputs(events)
    }

    fn reserve_price(&self, order: &NewOrder) -> Price {
        match (order.kind, self.books.get(order.market)) {
            (OrderType::Limit, _) | (_, None) => order.price.unwrap_or_default(),
            (OrderType::Market, Some(book)) => market_price(book, order),
        }
    }
}

// upper bound of fill notional / qty: buy walks asks to worst touched, sell = best bid
fn market_price(book: &OrderBook, order: &NewOrder) -> Price {
    let levels = book.depth(order.side.opposite());
    let within = |p: &Price| match (order.side, order.price) {
        (_, None) => true,
        (Side::Buy, Some(limit)) => *p <= limit,
        (Side::Sell, Some(limit)) => *p >= limit,
    };
    if order.side == Side::Sell {
        return levels
            .first()
            .map(|l| l.0)
            .filter(within)
            .unwrap_or_default();
    }
    let mut left = order.qty.0;
    let mut worst = Price::default();
    for (price, qty) in levels.into_iter().take_while(|(p, _)| within(p)) {
        worst = price;
        left = left.saturating_sub(qty.0);
        if left == 0 {
            break;
        }
    }
    worst
}
