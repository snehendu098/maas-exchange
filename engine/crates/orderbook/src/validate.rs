use types::{MarketConfig, OrderType, TimeInForce};

use crate::{NewOrder, RejectReason};

pub(crate) fn validate(cfg: &MarketConfig, order: &NewOrder) -> Result<(), RejectReason> {
    if order.market != cfg.id {
        return Err(RejectReason::WrongMarket);
    }
    if order.qty.is_zero() {
        return Err(RejectReason::ZeroQty);
    }
    if !cfg.is_valid_qty(order.qty) {
        return Err(RejectReason::InvalidLot);
    }
    match (order.kind, order.price) {
        (OrderType::Limit, None) => return Err(RejectReason::MissingPrice),
        (_, Some(p)) if !cfg.is_valid_price(p) => return Err(RejectReason::InvalidTick),
        _ => {}
    }
    if order.kind == OrderType::Market && order.tif == TimeInForce::PostOnly {
        return Err(RejectReason::InvalidTif);
    }
    Ok(())
}
