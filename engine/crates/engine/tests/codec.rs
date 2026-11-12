mod common;

use common::{acct, engine, fund, limit, BTC, ONE, PX};
use engine::adapters::codec::{decode, encode, DecodeError};
use engine::adapters::subjects::InKind;
use engine::app::{ChainUpdate, Command, PlaceOrder, SettleResult};
use proto::v1::{self as pb, chain_update::Update, engine_output::Event as PbEvent};
use proto::Message;
use types::{OrderType, Price, Qty, Side, TimeInForce, TradeId};

fn pb_order() -> pb::Order {
    pb::Order {
        trader: "t1.testnet".into(),
        market: 0,
        side: pb::Side::Sell.into(),
        r#type: pb::OrderType::Limit.into(),
        tif: pb::TimeInForce::Gtc.into(),
        price: PX,
        size: ONE,
        nonce: 1,
        expiry_ms: 2_000_000_000_000,
        client_id: "c1".into(),
        order_hash: vec![0; 32],
        signature: vec![0; 64],
        public_key: "ed25519:11111111111111111111111111111111".into(),
        reduce_only: false,
    }
}

#[test]
fn decodes_order() {
    let cmd = decode(InKind::Order, &pb_order().encode_to_vec()).unwrap();
    assert_eq!(
        cmd,
        Command::Place(PlaceOrder {
            account: acct(1),
            market: BTC,
            side: Side::Sell,
            kind: OrderType::Limit,
            tif: TimeInForce::Gtc,
            price: Some(Price(PX)),
            qty: Qty(ONE),
            reduce_only: false,
        })
    );
}

#[test]
fn rejects_malformed() {
    let mut bad = pb_order();
    bad.trader = "Bad.testnet".into();
    assert!(matches!(
        decode(InKind::Order, &bad.encode_to_vec()),
        Err(DecodeError::Account(_))
    ));
    let mut bad = pb_order();
    bad.side = 0;
    assert!(matches!(
        decode(InKind::Order, &bad.encode_to_vec()),
        Err(DecodeError::Unspecified("side"))
    ));
    assert!(decode(InKind::Cancel, &[0xff, 0xff]).is_err());
}

#[test]
fn decodes_chain_and_settle() {
    let balance = pb::ChainUpdate {
        update: Some(Update::Balance(pb::BalanceUpdate {
            trader: "t2.testnet".into(),
            collateral: "-170141183460469231731687303715884105728".into(),
            block_height: 1,
            log_index: 0,
        })),
    };
    assert_eq!(
        decode(InKind::Chain, &balance.encode_to_vec()).unwrap(),
        Command::Chain(ChainUpdate::Balance {
            account: acct(2),
            collateral: i128::MIN,
            block: 1,
        })
    );
    let settle = pb::SettleResult {
        batch_id: "b1".into(),
        tx_hash: "11111111111111111111111111111111".into(),
        settled: vec![pb::FillRef {
            market: 0,
            trade_id: 4,
        }],
        failed: vec![],
        block_height: 7,
    };
    assert_eq!(
        decode(InKind::Settle, &settle.encode_to_vec()).unwrap(),
        Command::Settle(SettleResult {
            settled: vec![(BTC, TradeId(4))],
            failed: vec![],
            block: 7,
        })
    );
}

#[test]
fn encodes_outputs_with_seq_and_subjects() {
    let mut e = engine();
    e.apply(1, fund(1, 10_000));
    e.apply(2, fund(2, 10_000));
    e.apply(3, limit(1, Side::Sell, PX, ONE));
    let outputs = e.apply(4, limit(2, Side::Buy, PX, ONE));
    let msgs = encode(e.markets(), 4, &outputs);
    assert_eq!(msgs.len(), outputs.len());

    let fill = msgs
        .iter()
        .find(|m| m.subject == "engine.out.fill.BTC")
        .expect("fill msg");
    let out = pb::EngineOutput::decode(fill.payload.as_slice()).unwrap();
    assert_eq!(out.input_seq, 4);
    assert_eq!(fill.msg_id, format!("4-{}", out.index));
    let Some(PbEvent::Fill(f)) = out.event else {
        panic!("want fill");
    };
    assert_eq!((f.price, f.size, f.trade_id), (PX, ONE, 1));
    assert_eq!(f.taker_side(), pb::Side::Buy);
    assert!(msgs.iter().any(|m| m.subject == "engine.out.book.BTC"));
    assert!(msgs.iter().any(|m| m.subject == "engine.out.status.BTC"));
}
