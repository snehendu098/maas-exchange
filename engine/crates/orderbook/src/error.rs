#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RejectReason {
    UnknownMarket,
    WrongMarket,
    ZeroQty,
    InvalidLot,
    InvalidTick,
    MissingPrice,
    InvalidTif,
    DuplicateOrderId,
    PostOnlyWouldCross,
    ReduceOnlyWouldIncrease,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CancelReason {
    User,
    // ioc / market remainder
    Unfilled,
    SelfTrade,
    ReduceOnly,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CancelError {
    UnknownMarket,
    UnknownOrder,
}
