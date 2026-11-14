//! proto <-> domain mapping. i128/u128 travel as base-10 strings.

mod decode;
mod encode;

pub use decode::{decode, DecodeError};
pub use encode::{encode, OutMsg};
