use std::str::FromStr;

use proto::v1::{self as pb, chain_update::Update};
use proto::Message;
use risk::Position;
use types::{AccountId, MarketId, OrderType, Price, Qty, Side, TimeInForce, TradeId};

use crate::adapters::subjects::InKind;
use crate::app::{CancelOrder, ChainUpdate, Command, PlaceOrder, SettleResult};

#[derive(Debug, thiserror::Error)]
pub enum DecodeError {
    #[error("protobuf: {0}")]
    Proto(#[from] proto::DecodeError),
    #[error("bad account id {0:?}")]
    Account(String),
    #[error("unspecified {0}")]
    Unspecified(&'static str),
    #[error("bad amount {0:?}")]
    Amount(String),
    #[error("empty chain update")]
    EmptyChain,
}

pub fn decode(kind: InKind, payload: &[u8]) -> Result<Command, DecodeError> {
    Ok(match kind {
        InKind::Order => Command::Place(order(pb::Order::decode(payload)?)?),
        InKind::Cancel => Command::Cancel(cancel(pb::Cancel::decode(payload)?)?),
        InKind::Chain => Command::Chain(chain(pb::ChainUpdate::decode(payload)?)?),
        InKind::Settle => Command::Settle(settle(pb::SettleResult::decode(payload)?)),
    })
}

fn order(o: pb::Order) -> Result<PlaceOrder, DecodeError> {
    Ok(PlaceOrder {
        account: account(&o.trader)?,
        market: MarketId(o.market),
        side: side(o.side())?,
        kind: match o.r#type() {
            pb::OrderType::Limit => OrderType::Limit,
            pb::OrderType::Market => OrderType::Market,
            pb::OrderType::Unspecified => return Err(DecodeError::Unspecified("order type")),
        },
        tif: match o.tif() {
            pb::TimeInForce::Gtc => TimeInForce::Gtc,
            pb::TimeInForce::Ioc => TimeInForce::Ioc,
            pb::TimeInForce::PostOnly => TimeInForce::PostOnly,
            pb::TimeInForce::Unspecified => return Err(DecodeError::Unspecified("tif")),
        },
        price: (o.price != 0).then_some(Price(o.price)),
        qty: Qty(o.size),
        reduce_only: o.reduce_only,
    })
}

fn cancel(c: pb::Cancel) -> Result<CancelOrder, DecodeError> {
    Ok(CancelOrder {
        account: account(&c.trader)?,
        market: MarketId(c.market),
        order: types::OrderId(c.order_id),
    })
}

fn chain(c: pb::ChainUpdate) -> Result<ChainUpdate, DecodeError> {
    Ok(match c.update.ok_or(DecodeError::EmptyChain)? {
        Update::Balance(b) => ChainUpdate::Balance {
            account: account(&b.trader)?,
            collateral: amount(&b.collateral)?,
            block: b.block_height,
        },
        Update::Position(p) => ChainUpdate::Position {
            account: account(&p.trader)?,
            market: MarketId(p.market),
            position: Position {
                size: amount(&p.size)?,
                entry_notional: amount(&p.entry_notional)?,
            },
            block: p.block_height,
        },
        Update::Mark(m) => ChainUpdate::Mark {
            market: MarketId(m.market),
            price: Price(m.price),
        },
    })
}

fn settle(s: pb::SettleResult) -> SettleResult {
    let refs = |v: Vec<pb::FillRef>| {
        v.into_iter()
            .map(|f| (MarketId(f.market), TradeId(f.trade_id)))
            .collect()
    };
    SettleResult {
        settled: refs(s.settled),
        failed: refs(s.failed),
        block: s.block_height,
    }
}

fn account(raw: &str) -> Result<AccountId, DecodeError> {
    AccountId::new(raw).ok_or_else(|| DecodeError::Account(raw.to_string()))
}

fn side(s: pb::Side) -> Result<Side, DecodeError> {
    match s {
        pb::Side::Buy => Ok(Side::Buy),
        pb::Side::Sell => Ok(Side::Sell),
        pb::Side::Unspecified => Err(DecodeError::Unspecified("side")),
    }
}

fn amount<T: FromStr>(s: &str) -> Result<T, DecodeError> {
    s.parse().map_err(|_| DecodeError::Amount(s.to_string()))
}
