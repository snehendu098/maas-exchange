use orderbook::{BookDelta, CancelError, CancelReason, Event, Fill, RejectReason, StatusKind};
use proto::v1::{self as pb, engine_output::Event as PbEvent, OrderState, Reason};
use proto::Message;
use risk::RiskError;
use types::{MarketId, Markets, Side};

use crate::adapters::subjects::OutKind;
use crate::app::{Cause, Output, Rejection};

// msg_id = "<input_seq>-<index>", used for jetstream dedup on replay
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OutMsg {
    pub subject: String,
    pub msg_id: String,
    pub payload: Vec<u8>,
}

pub fn encode(markets: &Markets, input_seq: u64, outputs: &[Output]) -> Vec<OutMsg> {
    outputs
        .iter()
        .enumerate()
        .map(|(i, out)| {
            let (kind, market, event) = event(out);
            let index = i as u32;
            let msg = pb::EngineOutput {
                input_seq,
                index,
                event: Some(event),
            };
            OutMsg {
                subject: kind.subject(symbol(markets, market)),
                msg_id: format!("{input_seq}-{index}"),
                payload: msg.encode_to_vec(),
            }
        })
        .collect()
}

fn symbol(markets: &Markets, id: MarketId) -> &str {
    markets.get(id).map_or("UNKNOWN", |m| m.symbol.as_str())
}

fn event(out: &Output) -> (OutKind, MarketId, PbEvent) {
    match out {
        Output::Book(Event::Fill(f)) => (OutKind::Fill, f.market, PbEvent::Fill(fill(f))),
        Output::Book(Event::Delta(d)) => (OutKind::Book, d.market, PbEvent::Book(delta(d))),
        Output::Book(Event::Status(s)) => {
            let (state, reason) = status_kind(s.kind);
            let status = pb::OrderStatus {
                market: s.market.0,
                order_id: s.order_id.0,
                trader: s.account.as_str().to_string(),
                state: state.into(),
                reason: reason.into(),
                filled: s.filled.0,
                remaining: s.remaining.0,
            };
            (OutKind::Status, s.market, PbEvent::Status(status))
        }
        Output::Rejected(r) => (OutKind::Status, r.market, PbEvent::Status(rejection(r))),
    }
}

fn fill(f: &Fill) -> pb::Fill {
    pb::Fill {
        market: f.market.0,
        trade_id: f.trade_id.0,
        price: f.price.0,
        size: f.qty.0,
        taker_side: side(f.taker_side).into(),
        maker_order_id: f.maker_order.0,
        maker: f.maker_account.as_str().to_string(),
        taker_order_id: f.taker_order.0,
        taker: f.taker_account.as_str().to_string(),
    }
}

fn delta(d: &BookDelta) -> pb::BookDelta {
    pb::BookDelta {
        market: d.market.0,
        side: side(d.side).into(),
        price: d.price.0,
        size: d.qty.0,
    }
}

fn rejection(r: &Rejection) -> pb::OrderStatus {
    let (state, reason) = match r.cause {
        Cause::Risk(e) => (OrderState::Rejected, risk_reason(e)),
        Cause::Cancel(CancelError::UnknownMarket) => {
            (OrderState::CancelRejected, Reason::UnknownMarket)
        }
        Cause::Cancel(CancelError::UnknownOrder) => {
            (OrderState::CancelRejected, Reason::UnknownOrder)
        }
        Cause::NotOwner => (OrderState::CancelRejected, Reason::NotOwner),
    };
    pb::OrderStatus {
        market: r.market.0,
        order_id: r.order_id.0,
        trader: r.account.as_str().to_string(),
        state: state.into(),
        reason: reason.into(),
        filled: 0,
        remaining: r.remaining.0,
    }
}

fn status_kind(kind: StatusKind) -> (OrderState, Reason) {
    match kind {
        StatusKind::Accepted => (OrderState::Accepted, Reason::Unspecified),
        StatusKind::Rejected(r) => (OrderState::Rejected, reject_reason(r)),
        StatusKind::Resting => (OrderState::Resting, Reason::Unspecified),
        StatusKind::PartiallyFilled => (OrderState::PartiallyFilled, Reason::Unspecified),
        StatusKind::Filled => (OrderState::Filled, Reason::Unspecified),
        StatusKind::Cancelled(c) => (OrderState::Cancelled, cancel_reason(c)),
    }
}

fn reject_reason(r: RejectReason) -> Reason {
    match r {
        RejectReason::UnknownMarket => Reason::UnknownMarket,
        RejectReason::WrongMarket => Reason::WrongMarket,
        RejectReason::ZeroQty => Reason::ZeroSize,
        RejectReason::InvalidLot => Reason::InvalidLot,
        RejectReason::InvalidTick => Reason::InvalidTick,
        RejectReason::MissingPrice => Reason::MissingPrice,
        RejectReason::InvalidTif => Reason::InvalidTif,
        RejectReason::DuplicateOrderId => Reason::DuplicateOrderId,
        RejectReason::PostOnlyWouldCross => Reason::PostOnlyWouldCross,
        RejectReason::ReduceOnlyWouldIncrease => Reason::ReduceOnlyWouldIncrease,
    }
}

fn cancel_reason(c: CancelReason) -> Reason {
    match c {
        CancelReason::User => Reason::User,
        CancelReason::Unfilled => Reason::Unfilled,
        CancelReason::SelfTrade => Reason::SelfTrade,
        CancelReason::ReduceOnly => Reason::ReduceOnly,
    }
}

fn risk_reason(e: RiskError) -> Reason {
    match e {
        RiskError::UnknownMarket(_) => Reason::UnknownMarket,
        RiskError::MissingMark(_) => Reason::MissingMark,
        RiskError::DuplicateOrder(_) => Reason::DuplicateOrderId,
        RiskError::InsufficientMargin { .. } => Reason::InsufficientMargin,
        RiskError::DuplicatePending(..) | RiskError::UnknownPending(..) => Reason::Unspecified,
    }
}

fn side(s: Side) -> pb::Side {
    match s {
        Side::Buy => pb::Side::Buy,
        Side::Sell => pb::Side::Sell,
    }
}
