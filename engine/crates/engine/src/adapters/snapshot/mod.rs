//! Engine snapshot save/restore. bincode, atomic tmp + rename.

use std::fs::{self, File};
use std::io::{self, Write};
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::app::Engine;

// v2 = v1 + trailing risk ChainBlocks
const VERSION: u32 = 2;

#[derive(Debug, thiserror::Error)]
pub enum SnapshotError {
    #[error("io: {0}")]
    Io(#[from] io::Error),
    #[error("codec: {0}")]
    Codec(#[from] bincode::Error),
    #[error("snapshot version {0}, want {VERSION}")]
    Version(u32),
}

#[derive(Serialize, Deserialize)]
struct Snapshot<E> {
    version: u32,
    engine: E,
}

pub fn encode(engine: &Engine) -> Result<Vec<u8>, SnapshotError> {
    let snap = Snapshot {
        version: VERSION,
        engine,
    };
    let mut raw = bincode::serialize(&snap)?;
    bincode::serialize_into(&mut raw, engine.risk.chain_blocks())?;
    Ok(raw)
}

pub fn decode(mut raw: &[u8]) -> Result<Engine, SnapshotError> {
    let mut snap: Snapshot<Engine> = bincode::deserialize_from(&mut raw)?;
    match snap.version {
        1 => {}
        VERSION => snap
            .engine
            .risk
            .set_chain_blocks(bincode::deserialize_from(&mut raw)?),
        v => return Err(SnapshotError::Version(v)),
    }
    Ok(snap.engine)
}

pub fn save(path: &Path, engine: &Engine) -> Result<(), SnapshotError> {
    let raw = encode(engine)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("tmp");
    let mut file = File::create(&tmp)?;
    file.write_all(&raw)?;
    file.sync_all()?;
    fs::rename(&tmp, path)?;
    Ok(())
}

// None = no snapshot yet
pub fn load(path: &Path) -> Result<Option<Engine>, SnapshotError> {
    match fs::read(path) {
        Ok(raw) => decode(&raw).map(Some),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use risk::Position;
    use types::{default_markets, AccountId, MarketId, Markets};

    #[test]
    fn v1_loads_and_v2_keeps_chain_blocks() {
        let mut e = Engine::new(Markets::new(default_markets()).unwrap());
        e.risk
            .set_position(AccountId::new("t1.testnet").unwrap(), MarketId(0), Position::default(), 42);
        let v1 = bincode::serialize(&Snapshot {
            version: 1,
            engine: &e,
        })
        .unwrap();
        assert_eq!(
            decode(&v1).unwrap().risk.chain_blocks(),
            &Default::default()
        );
        let v2 = decode(&encode(&e).unwrap()).unwrap();
        assert_eq!(v2.risk.chain_blocks(), e.risk.chain_blocks());
    }
}
