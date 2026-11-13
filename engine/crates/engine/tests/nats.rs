//! Needs NATS JetStream (make test-integration). Wipes ENGINE_IN / ENGINE_OUT.

mod common;

use std::path::Path;
use std::time::Duration;

use async_nats::jetstream::consumer::{pull, AckPolicy};
use async_nats::jetstream::Context;
use common::{engine, fund, limit, scenario, ONE, PX};
use engine::adapters::bus::{streams, Bus};
use engine::adapters::{snapshot, subjects};
use engine::app::{ChainUpdate, Command, Engine};
use engine::Config;
use futures::StreamExt;
use proto::v1::{self as pb, chain_update::Update, engine_output::Event as PbEvent};
use proto::Message;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use tokio::time::{sleep, timeout, Instant};
use types::{default_markets, MarketId, OrderType, Side, TimeInForce};

const WAIT: Duration = Duration::from_secs(10);

#[tokio::test]
#[ignore = "needs nats: make test-integration"]
async fn crossing_orders_emit_one_fill() {
    let bus = fresh_bus().await;
    let js = bus.jetstream();
    let dir = tempfile::tempdir().unwrap();
    let (stop, task) = spawn(config(&dir.path().join("snap"), 1000));

    let mut fills = out_consumer(js, "engine.out.fill.>").await;
    let cmds = [
        fund(1, 10_000),
        fund(2, 10_000),
        limit(1, Side::Sell, PX, ONE),
        limit(2, Side::Buy, PX, ONE),
    ];
    for cmd in &cmds {
        publish(js, cmd).await;
    }

    let first = timeout(WAIT, fills.next()).await.expect("fill in time");
    let msg = first.unwrap().unwrap();
    assert_eq!(msg.subject.as_str(), "engine.out.fill.BTC");
    let out = pb::EngineOutput::decode(msg.payload.clone()).unwrap();
    assert_eq!(out.input_seq, 4);
    let Some(PbEvent::Fill(f)) = out.event else {
        panic!("want fill");
    };
    assert_eq!((f.price, f.size, f.trade_id), (PX, ONE, 1));
    assert_eq!((f.maker_order_id, f.taker_order_id), (3, 4));
    assert!(
        timeout(Duration::from_secs(1), fills.next()).await.is_err(),
        "exactly one fill"
    );

    stop.send(()).unwrap();
    let state = task.await.unwrap().unwrap();
    assert_eq!(state.seq(), 4);
    assert!(state.books().get(MarketId(0)).unwrap().best_bid().is_none());
}

#[tokio::test]
#[ignore = "needs nats: make test-integration"]
async fn kill_and_restart_rebuilds_identical_state() {
    let bus = fresh_bus().await;
    let js = bus.jetstream();
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("snap");
    let cmds = scenario(240);
    // kill point not on snapshot boundary -> restart must replay 121..=123
    let cut = 123;

    for cmd in &cmds[..cut] {
        publish(js, cmd).await;
    }
    let (_stop, task) = spawn(config(&path, 10));
    wait_acked(js, cut as u64).await;
    task.abort();
    let _ = task.await;
    assert_eq!(snapshot::load(&path).unwrap().unwrap().seq(), 120);

    for cmd in &cmds[cut..] {
        publish(js, cmd).await;
    }
    let (stop, task) = spawn(config(&path, 10));
    wait_acked(js, cmds.len() as u64).await;
    stop.send(()).unwrap();
    let restarted = task.await.unwrap().unwrap();

    let mut reference = engine();
    let mut outputs = 0;
    for (i, cmd) in cmds.iter().enumerate() {
        outputs += reference.apply(i as u64 + 1, cmd.clone()).len() as u64;
    }
    assert_eq!(
        snapshot::encode(&restarted).unwrap(),
        snapshot::encode(&reference).unwrap()
    );
    // replayed outputs deduped by msg id
    let mut out = js.get_stream("ENGINE_OUT").await.unwrap();
    assert_eq!(out.info().await.unwrap().state.messages, outputs);
}

async fn fresh_bus() -> Bus {
    let bus = Bus::connect(&nats_url()).await.expect("nats up");
    for name in [streams::engine_in().name, streams::engine_out().name] {
        let _ = bus.jetstream().delete_stream(name).await;
    }
    bus.ensure_streams().await.unwrap();
    bus
}

fn nats_url() -> String {
    std::env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".into())
}

fn config(path: &Path, every: u64) -> Config {
    Config {
        nats_url: nats_url(),
        snapshot_path: path.to_path_buf(),
        snapshot_every: every,
    }
}

fn spawn(cfg: Config) -> (oneshot::Sender<()>, JoinHandle<anyhow::Result<Engine>>) {
    let (tx, rx) = oneshot::channel();
    let task = tokio::spawn(engine::run(cfg, async {
        let _ = rx.await;
    }));
    (tx, task)
}

async fn out_consumer(js: &Context, filter: &str) -> pull::Stream {
    js.get_stream("ENGINE_OUT")
        .await
        .unwrap()
        .create_consumer(pull::Config {
            filter_subject: filter.into(),
            ack_policy: AckPolicy::None,
            ..Default::default()
        })
        .await
        .unwrap()
        .messages()
        .await
        .unwrap()
}

async fn wait_acked(js: &Context, seq: u64) {
    let deadline = Instant::now() + WAIT;
    loop {
        let floor = match js
            .get_consumer_from_stream::<pull::Config, _, _>("engine", "ENGINE_IN")
            .await
        {
            Ok(mut c) => c.info().await.map_or(0, |i| i.ack_floor.stream_sequence),
            Err(_) => 0,
        };
        if floor >= seq {
            return;
        }
        assert!(
            Instant::now() < deadline,
            "engine stuck at {floor}, want {seq}"
        );
        sleep(Duration::from_millis(50)).await;
    }
}

async fn publish(js: &Context, cmd: &Command) {
    let (subject, payload) = encode(cmd);
    js.publish(subject, payload.into())
        .await
        .unwrap()
        .await
        .unwrap();
}

fn symbol(market: MarketId) -> String {
    default_markets()
        .into_iter()
        .find(|m| m.id == market)
        .unwrap()
        .symbol
}

fn side(s: Side) -> i32 {
    match s {
        Side::Buy => pb::Side::Buy,
        Side::Sell => pb::Side::Sell,
    }
    .into()
}

// domain command -> what gateway / indexer / settler would publish
fn encode(cmd: &Command) -> (String, Vec<u8>) {
    match cmd {
        Command::Place(o) => {
            let msg = pb::Order {
                trader: o.account.as_str().to_string(),
                market: o.market.0,
                side: side(o.side),
                r#type: match o.kind {
                    OrderType::Limit => pb::OrderType::Limit,
                    OrderType::Market => pb::OrderType::Market,
                }
                .into(),
                tif: match o.tif {
                    TimeInForce::Gtc => pb::TimeInForce::Gtc,
                    TimeInForce::Ioc => pb::TimeInForce::Ioc,
                    TimeInForce::PostOnly => pb::TimeInForce::PostOnly,
                }
                .into(),
                price: o.price.map_or(0, |p| p.0),
                size: o.qty.0,
                reduce_only: o.reduce_only,
                ..Default::default()
            };
            (subjects::in_order(&symbol(o.market)), msg.encode_to_vec())
        }
        Command::Cancel(c) => {
            let msg = pb::Cancel {
                trader: c.account.as_str().to_string(),
                market: c.market.0,
                order_id: c.order.0,
            };
            (subjects::in_cancel(&symbol(c.market)), msg.encode_to_vec())
        }
        Command::Chain(u) => {
            let update = match u {
                ChainUpdate::Balance {
                    account,
                    collateral,
                    block,
                } => Update::Balance(pb::BalanceUpdate {
                    trader: account.as_str().to_string(),
                    collateral: collateral.to_string(),
                    block_height: *block,
                    ..Default::default()
                }),
                ChainUpdate::Position {
                    account,
                    market,
                    position,
                    block,
                } => Update::Position(pb::PositionUpdate {
                    trader: account.as_str().to_string(),
                    market: market.0,
                    size: position.size.to_string(),
                    entry_notional: position.entry_notional.to_string(),
                    block_height: *block,
                    ..Default::default()
                }),
                ChainUpdate::Mark { market, price } => Update::Mark(pb::MarkPrice {
                    market: market.0,
                    price: price.0,
                }),
            };
            let msg = pb::ChainUpdate {
                update: Some(update),
            };
            (subjects::IN_CHAIN.into(), msg.encode_to_vec())
        }
        Command::Settle(s) => {
            let refs = |v: &[(MarketId, types::TradeId)]| {
                v.iter()
                    .map(|(m, t)| pb::FillRef {
                        market: m.0,
                        trade_id: t.0,
                    })
                    .collect()
            };
            let msg = pb::SettleResult {
                settled: refs(&s.settled),
                failed: refs(&s.failed),
                block_height: s.block,
                ..Default::default()
            };
            (subjects::IN_SETTLE.into(), msg.encode_to_vec())
        }
    }
}
