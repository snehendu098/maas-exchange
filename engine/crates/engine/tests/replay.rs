mod common;

use common::{engine, scenario};
use engine::adapters::snapshot;
use engine::app::{Engine, Output};

fn run(engine: &mut Engine, cmds: &[engine::app::Command], from: usize) -> Vec<Vec<Output>> {
    cmds.iter()
        .enumerate()
        .skip(from)
        .map(|(i, cmd)| engine.apply(i as u64 + 1, cmd.clone()))
        .collect()
}

#[test]
fn restart_midway_matches_uninterrupted_run() {
    let cmds = scenario(600);
    let mid = 317;

    let mut full = engine();
    let all_outputs = run(&mut full, &cmds, 0);
    let fills = all_outputs.iter().flatten().filter(|o| is_fill(o)).count();
    assert!(fills > 20, "scenario too quiet: {fills} fills");

    // first half, snapshot to disk, "kill"
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("engine.snapshot");
    let mut first = engine();
    run(&mut first, &cmds[..mid], 0);
    snapshot::save(&path, &first).unwrap();
    drop(first);

    // restart: load + replay from seq+1. redelivered seqs are no-ops
    let mut restarted = snapshot::load(&path).unwrap().expect("snapshot");
    assert_eq!(restarted.seq(), mid as u64);
    assert!(restarted
        .apply(mid as u64, cmds[mid - 1].clone())
        .is_empty());
    let replayed = run(&mut restarted, &cmds, mid);

    assert_eq!(replayed, all_outputs[mid..]);
    assert_eq!(
        snapshot::encode(&restarted).unwrap(),
        snapshot::encode(&full).unwrap()
    );
    for market in full.markets().iter().map(|m| m.id) {
        let (a, b) = (full.books().get(market), restarted.books().get(market));
        for side in [types::Side::Buy, types::Side::Sell] {
            assert_eq!(a.unwrap().depth(side), b.unwrap().depth(side));
        }
    }
}

#[test]
fn load_missing_snapshot_is_none() {
    let dir = tempfile::tempdir().unwrap();
    assert!(snapshot::load(&dir.path().join("nope")).unwrap().is_none());
}

#[test]
fn save_is_atomic_overwrite() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("sub/engine.snapshot");
    let mut e = engine();
    snapshot::save(&path, &e).unwrap();
    e.skip(5);
    snapshot::save(&path, &e).unwrap();
    assert_eq!(snapshot::load(&path).unwrap().unwrap().seq(), 5);
    assert!(!path.with_extension("tmp").exists());
}

fn is_fill(o: &Output) -> bool {
    matches!(o, Output::Book(orderbook::Event::Fill(_)))
}
