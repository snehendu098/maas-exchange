use orderbook::{Event, Fill, StatusKind};
use risk::FillLeg;

use crate::app::{Engine, Output};

impl Engine {
    // mirror book events into risk: fills -> pending, terminal status -> release
    pub(crate) fn book_outputs(&mut self, events: Vec<Event>) -> Vec<Output> {
        for event in &events {
            match event {
                Event::Fill(fill) => self.record_fill(fill),
                Event::Status(s) if is_terminal(s.kind) => {
                    self.risk.release(&s.account, s.order_id);
                }
                _ => {}
            }
        }
        events.into_iter().map(Output::Book).collect()
    }

    fn record_fill(&mut self, f: &Fill) {
        let leg = |order, side| FillLeg {
            order,
            market: f.market,
            trade_id: f.trade_id,
            side,
            price: f.price,
            qty: f.qty,
        };
        let maker = leg(f.maker_order, f.taker_side.opposite());
        let taker = leg(f.taker_order, f.taker_side);
        // trade ids fresh per market, market known to book -> cannot fail
        self.risk
            .on_fill(f.maker_account, &maker)
            .expect("fresh fill");
        self.risk
            .on_fill(f.taker_account, &taker)
            .expect("fresh fill");
        self.unsettled
            .insert((f.market, f.trade_id), (f.maker_account, f.taker_account));
    }
}

fn is_terminal(kind: StatusKind) -> bool {
    matches!(
        kind,
        StatusKind::Filled | StatusKind::Cancelled(_) | StatusKind::Rejected(_)
    )
}
