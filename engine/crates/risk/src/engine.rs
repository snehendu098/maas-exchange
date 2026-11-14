use std::collections::BTreeMap;

use types::{AccountId, MarketConfig, MarketId, Markets, OrderId, Price, Qty, Side, TradeId};

use crate::math::initial_margin;
use crate::{
    free_margin, opening_qty, Account, Marks, PendingFill, Position, Reservation, RiskError,
};

// order to reserve for. market orders: price = engine worst-price estimate
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OrderIntent {
    pub id: OrderId,
    pub market: MarketId,
    pub side: Side,
    pub price: Price,
    pub qty: Qty,
    pub reduce_only: bool,
}

// one account's side of a fill
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FillLeg {
    pub order: OrderId,
    pub market: MarketId,
    pub trade_id: TradeId,
    pub side: Side,
    pub price: Price,
    pub qty: Qty,
}

#[derive(Clone, Debug, Default)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct RiskEngine {
    markets: Markets,
    accounts: BTreeMap<AccountId, Account>,
    // persisted as a trailing snapshot section (bincode can't default new fields)
    #[cfg_attr(feature = "serde", serde(skip))]
    chain: ChainBlocks,
}

// latest chain block applied per balance / position; settle skips what chain already has
#[derive(Clone, Debug, Default, PartialEq, Eq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct ChainBlocks {
    collateral: BTreeMap<AccountId, u64>,
    positions: BTreeMap<(AccountId, MarketId), u64>,
}

impl RiskEngine {
    pub fn new(markets: Markets) -> Self {
        Self {
            markets,
            accounts: BTreeMap::new(),
            chain: ChainBlocks::default(),
        }
    }

    pub fn chain_blocks(&self) -> &ChainBlocks {
        &self.chain
    }

    pub fn set_chain_blocks(&mut self, chain: ChainBlocks) {
        self.chain = chain;
    }

    pub fn markets(&self) -> &Markets {
        &self.markets
    }

    pub fn account(&self, id: &AccountId) -> Option<&Account> {
        self.accounts.get(id)
    }

    // onchain balance is source of truth; overwrite
    pub fn set_collateral(&mut self, id: AccountId, amount: i128, block: u64) {
        self.accounts.entry(id).or_default().collateral = amount;
        bump(self.chain.collateral.entry(id).or_default(), block);
    }

    // onchain position is source of truth; overwrite
    pub fn set_position(
        &mut self,
        id: AccountId,
        market: MarketId,
        position: Position,
        block: u64,
    ) {
        bump(self.chain.positions.entry((id, market)).or_default(), block);
        let positions = &mut self.accounts.entry(id).or_default().positions;
        if position.is_flat() {
            positions.remove(&market);
        } else {
            positions.insert(market, position);
        }
    }

    pub fn free_margin(&self, id: &AccountId, marks: &Marks) -> Result<i128, RiskError> {
        match self.accounts.get(id) {
            Some(acct) => free_margin(acct, &self.markets, marks),
            None => Ok(0),
        }
    }

    // call before booking. reduce-only reserves 0
    pub fn check_and_reserve(
        &mut self,
        id: AccountId,
        order: &OrderIntent,
        marks: &Marks,
    ) -> Result<u128, RiskError> {
        let cfg = self.config(order.market)?;
        let im = reservation_im(cfg, order.price, order.qty, order.reduce_only);
        let free = self.free_margin(&id, marks)?;
        let acct = self.accounts.entry(id).or_default();
        if acct.reservations.contains_key(&order.id) {
            return Err(RiskError::DuplicateOrder(order.id));
        }
        // reduce-only can't grow exposure (book enforces); let underwater accounts de-risk
        if !order.reduce_only && (im as i128) > free {
            return Err(RiskError::InsufficientMargin { required: im, free });
        }
        acct.reservations.insert(
            order.id,
            Reservation {
                market: order.market,
                side: order.side,
                price: order.price,
                remaining: order.qty,
                reduce_only: order.reduce_only,
                im,
            },
        );
        Ok(im)
    }

    // cancel or unrested remainder; returns released im
    pub fn release(&mut self, id: &AccountId, order: OrderId) -> u128 {
        self.accounts
            .get_mut(id)
            .and_then(|a| a.reservations.remove(&order))
            .map_or(0, |r| r.im)
    }

    // shrink order reservation, add pending im for exposure-increasing part
    pub fn on_fill(&mut self, id: AccountId, leg: &FillLeg) -> Result<(), RiskError> {
        let cfg = self.config(leg.market)?.clone();
        let acct = self.accounts.entry(id).or_default();
        let key = (leg.market, leg.trade_id);
        if acct.pending.contains_key(&key) {
            return Err(RiskError::DuplicatePending(leg.market, leg.trade_id));
        }
        if let Some(r) = acct.reservations.get_mut(&leg.order) {
            r.remaining = Qty(r.remaining.0.saturating_sub(leg.qty.0));
            r.im = reservation_im(&cfg, r.price, r.remaining, r.reduce_only);
            if r.remaining.is_zero() {
                acct.reservations.remove(&leg.order);
            }
        }
        let open = opening_qty(acct.effective_size(leg.market), leg.side, leg.qty);
        let pending = PendingFill {
            market: leg.market,
            side: leg.side,
            price: leg.price,
            qty: leg.qty,
            im: initial_margin(&cfg, leg.price, open),
        };
        acct.pending.insert(key, pending);
        Ok(())
    }

    // fill mined at block: move into position, book realized pnl.
    // chain view already at >= block includes it, so skip that part (block 0 = unknown, apply)
    pub fn settle(
        &mut self,
        id: &AccountId,
        market: MarketId,
        trade_id: TradeId,
        block: u64,
    ) -> Result<i128, RiskError> {
        let seen = |b: Option<&u64>| block > 0 && b >= Some(&block);
        let pos_seen = seen(self.chain.positions.get(&(*id, market)));
        let bal_seen = seen(self.chain.collateral.get(id));
        let acct = self.pending_account(id, market, trade_id)?;
        let fill = acct.pending.remove(&(market, trade_id)).expect("checked");
        if pos_seen {
            return Ok(0);
        }
        let pos = acct.positions.entry(market).or_default();
        let realized = pos.apply(fill.side, fill.price, fill.qty);
        if pos.is_flat() {
            acct.positions.remove(&market);
        }
        if bal_seen {
            return Ok(0);
        }
        acct.collateral += realized;
        Ok(realized)
    }

    // settlement failed: drop fill without touching position
    pub fn discard(
        &mut self,
        id: &AccountId,
        market: MarketId,
        trade_id: TradeId,
    ) -> Result<(), RiskError> {
        let acct = self.pending_account(id, market, trade_id)?;
        acct.pending.remove(&(market, trade_id));
        Ok(())
    }

    fn pending_account(
        &mut self,
        id: &AccountId,
        market: MarketId,
        trade_id: TradeId,
    ) -> Result<&mut Account, RiskError> {
        self.accounts
            .get_mut(id)
            .filter(|a| a.pending.contains_key(&(market, trade_id)))
            .ok_or(RiskError::UnknownPending(market, trade_id))
    }

    fn config(&self, market: MarketId) -> Result<&MarketConfig, RiskError> {
        self.markets
            .get(market)
            .ok_or(RiskError::UnknownMarket(market))
    }
}

fn bump(slot: &mut u64, block: u64) {
    *slot = (*slot).max(block);
}

fn reservation_im(cfg: &MarketConfig, price: Price, qty: Qty, reduce_only: bool) -> u128 {
    if reduce_only {
        0
    } else {
        initial_margin(cfg, price, qty)
    }
}
