//! Margin math + per-account risk state. Pure, no I/O.

mod account;
mod engine;
mod error;
mod margin;
mod marks;
pub mod math;
mod position;

pub use account::{Account, PendingFill, Reservation};
pub use engine::{ChainBlocks, FillLeg, OrderIntent, RiskEngine};
pub use error::RiskError;
pub use margin::{equity, free_margin, position_im};
pub use marks::Marks;
pub use position::{opening_qty, Position};
