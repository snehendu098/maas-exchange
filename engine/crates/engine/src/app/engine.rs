use std::collections::BTreeMap;

use orderbook::Books;
use risk::{Marks, RiskEngine};
use serde::{Deserialize, Serialize};
use types::{AccountId, MarketId, Markets, OrderId, TradeId};

use crate::app::{Command, Output};

// (maker, taker) of a fill awaiting settlement
pub(crate) type Counterparties = (AccountId, AccountId);

// whole deterministic engine state = snapshot payload
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Engine {
    pub(crate) books: Books,
    pub(crate) risk: RiskEngine,
    pub(crate) marks: Marks,
    pub(crate) unsettled: BTreeMap<(MarketId, TradeId), Counterparties>,
    seq: u64,
}

impl Engine {
    pub fn new(markets: Markets) -> Self {
        Self {
            books: Books::new(&markets),
            risk: RiskEngine::new(markets),
            marks: Marks::new(),
            unsettled: BTreeMap::new(),
            seq: 0,
        }
    }

    // last applied input seq
    pub fn seq(&self) -> u64 {
        self.seq
    }

    pub fn markets(&self) -> &Markets {
        self.risk.markets()
    }

    pub fn books(&self) -> &Books {
        &self.books
    }

    pub fn risk(&self) -> &RiskEngine {
        &self.risk
    }

    pub fn marks(&self) -> &Marks {
        &self.marks
    }

    // seq already applied (replay / redelivery) -> no-op
    pub fn apply(&mut self, seq: u64, cmd: Command) -> Vec<Output> {
        if !self.advance(seq) {
            return Vec::new();
        }
        match cmd {
            Command::Place(order) => self.place(OrderId(seq), order),
            Command::Cancel(cancel) => self.cancel(cancel),
            Command::Chain(update) => self.apply_chain(update),
            Command::Settle(result) => self.apply_settle(result),
        }
    }

    // undecodable input: consume seq, change nothing
    pub fn skip(&mut self, seq: u64) {
        self.advance(seq);
    }

    fn advance(&mut self, seq: u64) -> bool {
        if seq <= self.seq {
            return false;
        }
        self.seq = seq;
        true
    }
}
