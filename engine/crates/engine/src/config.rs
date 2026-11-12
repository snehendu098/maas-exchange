use std::path::PathBuf;

use anyhow::{Context, Result};

#[derive(Clone, Debug)]
pub struct Config {
    pub nats_url: String,
    pub snapshot_path: PathBuf,
    // snapshot when input seq % every == 0
    pub snapshot_every: u64,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let every = var("ENGINE_SNAPSHOT_EVERY", "1000");
        Ok(Self {
            nats_url: var("NATS_URL", "nats://localhost:4222"),
            snapshot_path: var("ENGINE_SNAPSHOT_PATH", "data/engine.snapshot").into(),
            snapshot_every: every
                .parse()
                .ok()
                .filter(|n| *n > 0)
                .with_context(|| format!("ENGINE_SNAPSHOT_EVERY={every:?}"))?,
        })
    }
}

fn var(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}
