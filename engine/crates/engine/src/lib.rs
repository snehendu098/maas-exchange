//! Engine service: single ordered consumer of ENGINE_IN.

pub mod adapters;
pub mod app;
pub mod config;
mod service;

pub use config::Config;
pub use service::run;
