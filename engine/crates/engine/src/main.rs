use anyhow::Result;
use engine::Config;
use tokio::signal::unix::{signal, SignalKind};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(filter).init();
    let cfg = Config::from_env()?;
    let mut term = signal(SignalKind::terminate())?;
    let shutdown = async move {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = term.recv() => {}
        }
    };
    engine::run(cfg, shutdown).await?;
    Ok(())
}
