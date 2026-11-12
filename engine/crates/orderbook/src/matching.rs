use std::collections::BTreeMap;

use types::{AccountId, OrderType, Price, Qty, Side, TimeInForce, TradeId};

use crate::position::closable;
use crate::validate::validate;
use crate::{
    CancelReason, Event, Fill, NewOrder, OrderBook, PositionLookup, RejectReason, RestingOrder,
    StatusKind,
};

struct Outcome {
    filled: Qty,
    remaining: Qty,
    self_trade: bool,
}

impl OrderBook {
    pub fn submit(&mut self, order: NewOrder, positions: &impl PositionLookup) -> Vec<Event> {
        let mut events = Vec::new();
        let qty = match self.admit(&order, positions) {
            Ok(qty) => qty,
            Err(reason) => {
                let kind = StatusKind::Rejected(reason);
                events.push(self.status(order.id, order.account, kind, Qty::ZERO, order.qty));
                return events;
            }
        };
        let accepted = StatusKind::Accepted;
        events.push(self.status(order.id, order.account, accepted, Qty::ZERO, qty));
        let outcome = self.match_taker(&order, qty, positions, &mut events);
        self.finish(&order, outcome, &mut events);
        events
    }

    // validated qty, clipped for reduce-only
    fn admit(
        &self,
        order: &NewOrder,
        positions: &impl PositionLookup,
    ) -> Result<Qty, RejectReason> {
        validate(&self.config, order)?;
        if self.contains(order.id) {
            return Err(RejectReason::DuplicateOrderId);
        }
        if order.tif == TimeInForce::PostOnly && self.crosses(order.side, order.price) {
            return Err(RejectReason::PostOnlyWouldCross);
        }
        if !order.reduce_only {
            return Ok(order.qty);
        }
        let room = closable(
            positions.position(&order.account, self.config.id),
            order.side,
        );
        if room == 0 {
            return Err(RejectReason::ReduceOnlyWouldIncrease);
        }
        Ok(clip(order.qty, room))
    }

    fn crosses(&self, side: Side, limit: Option<Price>) -> bool {
        match (self.best_opposite(side), limit) {
            (None, _) => false,
            (Some(_), None) => true,
            (Some(best), Some(l)) => match side {
                Side::Buy => best <= l,
                Side::Sell => best >= l,
            },
        }
    }

    fn match_taker(
        &mut self,
        order: &NewOrder,
        qty: Qty,
        positions: &impl PositionLookup,
        events: &mut Vec<Event>,
    ) -> Outcome {
        let maker_side = order.side.opposite();
        let mut out = Outcome {
            filled: Qty::ZERO,
            remaining: qty,
            self_trade: false,
        };
        // maker position change within this submit, for reduce-only makers
        let mut moved: BTreeMap<AccountId, i128> = BTreeMap::new();

        while !out.remaining.is_zero() && self.crosses(order.side, order.price) {
            let price = self
                .best_opposite(order.side)
                .expect("crosses implies level");
            let maker = self.front(maker_side, price).expect("level non-empty");
            if maker.account == order.account {
                out.self_trade = true;
                break;
            }
            let mut cap = maker.remaining;
            if maker.reduce_only {
                let shift = moved.get(&maker.account).copied().unwrap_or(0);
                let pos = positions.position(&maker.account, self.config.id) + shift;
                let room = closable(pos, maker_side);
                if room == 0 {
                    self.cancel_resting(
                        maker_side,
                        price,
                        maker.id,
                        CancelReason::ReduceOnly,
                        events,
                    );
                    continue;
                }
                cap = clip(cap, room);
            }
            let q = out.remaining.min(cap);
            *moved.entry(maker.account).or_default() += maker_side.sign() * q.0 as i128;
            out.remaining -= q;
            out.filled += q;
            self.execute(order, &maker, price, q, events);
        }
        out
    }

    fn execute(
        &mut self,
        taker: &NewOrder,
        maker: &RestingOrder,
        price: Price,
        qty: Qty,
        events: &mut Vec<Event>,
    ) {
        let trade_id = TradeId(self.next_trade_id());
        events.push(Event::Fill(Fill {
            market: self.config.id,
            trade_id,
            price,
            qty,
            taker_side: taker.side,
            maker_order: maker.id,
            maker_account: maker.account,
            taker_order: taker.id,
            taker_account: taker.account,
        }));
        let after = self.fill_front(maker.side, price, qty);
        events.push(self.delta(maker.side, price));
        let kind = if after.remaining.is_zero() {
            StatusKind::Filled
        } else {
            StatusKind::PartiallyFilled
        };
        events.push(self.status(after.id, after.account, kind, after.filled, after.remaining));
    }

    fn finish(&mut self, order: &NewOrder, out: Outcome, events: &mut Vec<Event>) {
        let rests = order.kind == OrderType::Limit && order.tif != TimeInForce::Ioc;
        let kind = if out.self_trade {
            StatusKind::Cancelled(CancelReason::SelfTrade)
        } else if out.remaining.is_zero() {
            StatusKind::Filled
        } else if rests {
            events.push(self.rest(RestingOrder {
                id: order.id,
                account: order.account,
                side: order.side,
                price: order.price.expect("limit has price"),
                remaining: out.remaining,
                filled: out.filled,
                reduce_only: order.reduce_only,
            }));
            StatusKind::Resting
        } else {
            StatusKind::Cancelled(CancelReason::Unfilled)
        };
        events.push(self.status(order.id, order.account, kind, out.filled, out.remaining));
    }
}

fn clip(qty: Qty, room: u128) -> Qty {
    Qty((qty.0 as u128).min(room) as u64)
}
