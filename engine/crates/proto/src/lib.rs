//! prost types generated from `proto/perp/v1`.

pub mod perp {
    pub mod v1 {
        include!(concat!(env!("OUT_DIR"), "/perp.v1.rs"));
    }
}

pub use perp::v1;
pub use prost::{DecodeError, Message};
