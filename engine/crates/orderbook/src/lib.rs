//! Order book + price-time matching. Pure, no I/O.

mod book;
mod books;
mod error;
mod event;
mod level;
mod matching;
mod order;
mod position;
mod validate;

pub use book::OrderBook;
pub use books::Books;
pub use error::{CancelError, CancelReason, RejectReason};
pub use event::{BookDelta, Event, Fill, OrderStatus, StatusKind};
pub use order::{NewOrder, RestingOrder};
pub use position::PositionLookup;
