#![allow(dead_code)]

use engine::app::{CancelOrder, ChainUpdate, Command, Engine, PlaceOrder, SettleResult};
use types::{
    default_markets, AccountId, MarketId, Markets, OrderId, OrderType, Price, Qty, Side,
    TimeInForce, TradeId,
};

pub const BTC: MarketId = MarketId(0);
pub const ETH: MarketId = MarketId(1);
pub const ONE: u64 = 100_000_000;
pub const USDC: i128 = 1_000_000;
// 60k usdc
pub const PX: u64 = 60_000_000_000;

pub fn engine() -> Engine {
    Engine::new(Markets::new(default_markets()).unwrap())
}

pub fn acct(n: u8) -> AccountId {
    AccountId::new(&format!("t{n}.testnet")).unwrap()
}

pub fn fund(n: u8, usdc: i128) -> Command {
    Command::Chain(ChainUpdate::Balance {
        account: acct(n),
        collateral: usdc * USDC,
        block: 0,
    })
}

pub fn limit(n: u8, side: Side, price: u64, qty: u64) -> Command {
    Command::Place(PlaceOrder {
        account: acct(n),
        market: BTC,
        side,
        kind: OrderType::Limit,
        tif: TimeInForce::Gtc,
        price: Some(Price(price)),
        qty: Qty(qty),
        reduce_only: false,
    })
}

pub fn cancel(n: u8, order: u64) -> Command {
    Command::Cancel(CancelOrder {
        account: acct(n),
        market: BTC,
        order: OrderId(order),
    })
}

pub fn settle(ok: &[u64], failed: &[u64]) -> Command {
    let refs = |v: &[u64]| v.iter().map(|t| (BTC, TradeId(*t))).collect();
    Command::Settle(SettleResult {
        settled: refs(ok),
        failed: refs(failed),
        block: 0,
    })
}

// deterministic pseudo-random mixed flow over BTC + ETH
pub fn scenario(n: usize) -> Vec<Command> {
    let mut rng = Lcg(42);
    let mut cmds: Vec<Command> = (1..=6).map(|a| fund(a, 10_000_000)).collect();
    let mut trade = 0;
    while cmds.len() < n {
        let roll = rng.next() % 100;
        let account = acct(1 + (rng.next() % 6) as u8);
        let cmd = match roll {
            0..=69 => {
                let (market, mid, tick, lot) = if rng.next().is_multiple_of(2) {
                    (BTC, PX, 100_000, 10_000)
                } else {
                    (ETH, 3_000_000_000, 10_000, 100_000)
                };
                let side = if rng.next().is_multiple_of(2) {
                    Side::Buy
                } else {
                    Side::Sell
                };
                let offset = (rng.next() % 21) as i64 - 10;
                let (kind, tif) = match rng.next() % 10 {
                    0 => (OrderType::Market, TimeInForce::Ioc),
                    1 => (OrderType::Limit, TimeInForce::Ioc),
                    2 => (OrderType::Limit, TimeInForce::PostOnly),
                    _ => (OrderType::Limit, TimeInForce::Gtc),
                };
                Command::Place(PlaceOrder {
                    account,
                    market,
                    side,
                    kind,
                    tif,
                    price: (kind == OrderType::Limit)
                        .then(|| Price((mid as i64 + offset * tick as i64) as u64)),
                    qty: Qty(lot * (1 + rng.next() % 50)),
                    reduce_only: rng.next().is_multiple_of(15),
                })
            }
            70..=84 => Command::Cancel(CancelOrder {
                account,
                market: if rng.next().is_multiple_of(2) {
                    BTC
                } else {
                    ETH
                },
                order: OrderId(1 + rng.next() % cmds.len() as u64),
            }),
            85..=92 => {
                trade += 1;
                let refs = vec![(BTC, TradeId(trade)), (ETH, TradeId(trade))];
                if rng.next().is_multiple_of(4) {
                    Command::Settle(SettleResult {
                        settled: vec![],
                        failed: refs,
                        block: 0,
                    })
                } else {
                    Command::Settle(SettleResult {
                        settled: refs,
                        failed: vec![],
                        block: 0,
                    })
                }
            }
            _ => Command::Chain(ChainUpdate::Mark {
                market: if rng.next().is_multiple_of(2) {
                    BTC
                } else {
                    ETH
                },
                price: Price(if rng.next().is_multiple_of(2) {
                    PX
                } else {
                    3_000_000_000
                }),
            }),
        };
        cmds.push(cmd);
    }
    cmds
}

struct Lcg(u64);

impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        self.0 >> 33
    }
}
