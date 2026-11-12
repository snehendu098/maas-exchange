use std::future::Future;

use anyhow::{anyhow, bail, Result};
use tracing::{debug, info, warn};
use types::{default_markets, Markets};

use crate::adapters::bus::{Bus, InMsg};
use crate::adapters::subjects::InKind;
use crate::adapters::{codec, snapshot};
use crate::app::{Command, Engine};
use crate::Config;

// load snapshot, replay ENGINE_IN from seq+1, process until shutdown. returns final state
pub async fn run(cfg: Config, shutdown: impl Future<Output = ()>) -> Result<Engine> {
    let mut engine = boot(&cfg)?;
    let bus = Bus::connect(&cfg.nats_url).await?;
    bus.ensure_streams().await?;
    let mut inputs = bus.inputs(engine.seq() + 1).await?;
    info!(seq = engine.seq(), "engine consuming ENGINE_IN");

    tokio::pin!(shutdown);
    loop {
        let msg = tokio::select! {
            _ = &mut shutdown => break,
            next = inputs.next() => match next {
                Some(msg) => msg?,
                None => bail!("ENGINE_IN consumer closed"),
            },
        };
        step(&mut engine, &bus, msg, &cfg).await?;
    }
    snapshot::save(&cfg.snapshot_path, &engine)?;
    info!(seq = engine.seq(), "engine stopped, snapshot saved");
    Ok(engine)
}

fn boot(cfg: &Config) -> Result<Engine> {
    if let Some(engine) = snapshot::load(&cfg.snapshot_path)? {
        info!(seq = engine.seq(), path = %cfg.snapshot_path.display(), "snapshot loaded");
        return Ok(engine);
    }
    let markets = Markets::new(default_markets()).map_err(|e| anyhow!("markets: {e:?}"))?;
    Ok(Engine::new(markets))
}

// apply -> publish outputs -> ack. redelivered seq: ack only
async fn step(engine: &mut Engine, bus: &Bus, msg: InMsg, cfg: &Config) -> Result<()> {
    let seq = msg.seq;
    if seq > engine.seq() {
        let outputs = match command(&msg) {
            Ok(cmd) => engine.apply(seq, cmd),
            Err(e) => {
                warn!(seq, subject = %msg.subject, error = %e, "skip undecodable input");
                engine.skip(seq);
                Vec::new()
            }
        };
        bus.publish(codec::encode(engine.markets(), seq, &outputs))
            .await?;
    }
    msg.ack().await?;
    if seq.is_multiple_of(cfg.snapshot_every) {
        match snapshot::save(&cfg.snapshot_path, engine) {
            Ok(()) => debug!(seq, "snapshot saved"),
            Err(e) => warn!(seq, error = %e, "snapshot failed"),
        }
    }
    Ok(())
}

fn command(msg: &InMsg) -> Result<Command> {
    let kind = InKind::parse(&msg.subject).ok_or_else(|| anyhow!("unknown subject"))?;
    Ok(codec::decode(kind, &msg.payload)?)
}
