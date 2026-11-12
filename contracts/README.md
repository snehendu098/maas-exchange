# contracts

NEAR contracts for MaaS Exchange (near-sdk 5).

| crate | what |
|---|---|
| `perp-math` | fixed-point helpers: notional, margin, upnl, funding (256-bit mul_div) |
| `perp-exchange` | cross-margin perp settlement of offchain-matched signed orders |
| `delta-vault` | delta-neutral USDC vault, NEP-141 share `mxUSDC` (6dp) |

Units: USDC 6dp. price = USDC 1e6 per 1 base. size = base 1e8 (signed for positions). funding rate 1e18 = 100%, funding index = USDC-wei * 1e18 per 1 base. All u128/i128 in JSON are decimal strings.

## build + test

```sh
cargo test
cargo build --target wasm32-unknown-unknown --release
# deploy-grade wasm (strips features older nearcore rejects):
cargo near build non-reproducible-wasm --manifest-path perp-exchange/Cargo.toml
cargo near build non-reproducible-wasm --manifest-path delta-vault/Cargo.toml
```

## perp-exchange

Init: `new(owner, operator, keeper, fee_recipient, insurance, usdc, max_price_age_ms)`.

| method | who | notes |
|---|---|---|
| `ft_on_transfer` | usdc | deposit via `usdc.ft_transfer_call(exchange, amount, msg)`; msg `""` credits sender, `{"account_id":"x"}` credits x |
| `withdraw(amount)` | any, 1 yocto | realized collateral only, must stay >= IM; resolves `true`, or `false` + refund if transfer failed |
| `add_trading_key(public_key)` / `remove_trading_key` | trader, 1 yocto | ed25519 only, max 8 |
| `settle(fills)` | operator | batch atomic; checks below |
| `cancel(order)` | order.trader | |
| `update_funding(market_id, rate)` | keeper | `|rate| <= 1e16` (1%), index += rate * mark |
| `liquidate(account_id, market_id)` | keeper | when equity < MM; position moves to insurance at mark, penalty = MM/2 of notional (capped at collateral), bad debt to insurance once flat |
| `push_prices([[market_id, price, publish_ms]])` | keeper | non-newer points skipped, future rejected |
| `set_market(market_id, market)` | owner | `market_id < 4`, `mmr < imr <= 1e4`, `max_leverage == 1e4 / imr` |
| `set_fee_exempt(account_id, exempt)`, `set_operator`, `set_keeper`, `set_max_price_age(ms)` | owner | |

Views: `position(account_id, market_id) -> {size, entry_notional, last_funding_index}`, `collateral`, `equity`, `margins -> {im, mm}`, `market`, `funding_index`, `funding_dust`, `filled(order_hash)`, `cancelled(order_hash)`, `fee_exempt`, `order_hash(order)`, `price(market_id)` (panics if older than `max_price_age_ms`), `trading_keys`, `owner`, `operator`, `keeper`, `fee_recipient`, `insurance`, `usdc`, `max_price_age_ms`.

Market: `{tick_size: U128, lot_size: U128, max_leverage: u32, imr_bps: u32, mmr_bps: u32, maker_fee_bps: u32, taker_fee_bps: u32}`.

### orders

```
Order { trader: AccountId, market_id: u32, is_buy: bool, price: U128, size: U128, reduce_only: bool, nonce: u64, expiry_ms: u64 }
order_hash = sha256(borsh(Order))   // AccountId = u32 LE len + bytes, u32/u64 LE, U128 = 16 bytes LE, bool = 1 byte
sig        = ed25519(order_hash) by one of trader's trading keys (64 bytes, base64 in JSON)
Fill { maker, taker, maker_key, maker_sig, taker_key, taker_sig, price, size }
```

Settle checks per fill: same market, opposite sides, no self trade, market known, size on lot, price on tick, not expired, not cancelled, price within both limits, no overfill, key registered + sig valid, reduce_only only reduces, after fill growth needs IM / reduce leaving negative collateral needs MM (flat -> written off to insurance). Fees: ceil(notional * bps / 1e4), maker/taker bps, 0 for fee_exempt, credited to fee_recipient collateral.

### events

NEP-297 `EVENT_JSON:{"standard":"maas-exchange","version":"1.0.0","event":<name>,"data":[{...}]}`

| event | data |
|---|---|
| `deposited` / `withdrawn` | account_id, amount, collateral |
| `traded` | market_id, maker_order_hash, taker_order_hash, maker, taker, taker_is_buy, price, size, maker_fee, taker_fee |
| `position_updated` | account_id, market_id, size, entry_notional, funding_index, realized_pnl, funding_paid, collateral |
| `collateral_updated` | account_id, collateral |
| `order_cancelled` | trader, order_hash |
| `funding_updated` | market_id, rate, price, index |
| `liquidated` | account_id, market_id, liquidator, price, size, penalty, bad_debt |
| `market_set` | market_id, market |
| `price_pushed` | market_id, price, publish_ms |

Per fill order: `position_updated`(maker), `position_updated`(taker), `collateral_updated`(fee_recipient, if fees), `traded`. Funding dust sweeps may add `collateral_updated`(insurance) before a `position_updated`.

## delta-vault

Init: `new(owner, keeper, usdc, exchange, ref_exchange, markets: [VaultMarket; 3], config)`.
`VaultMarket {base_token, base_decimals, ref_pool_id}` for perp markets 0..2 (BTC/ETH/NEAR).
Config: `{weights_bps[3] (sum 1e4), short_leverage_bps (1e4..5e4), idle_buffer_bps (<= 5000), withdraw_fee_bps (<= 100), cooldown_ms, price_band_bps (1..1000), slippage_bps (<= 1000), size_cap[3], max_price_age_ms (> 0)}`.

NAV = idle + ref_usdc + spot (snapshot prices) + perp equity (snapshot). `sync()` (anyone, ~60 Tgas) caches vault equity, positions and mark prices from the exchange. Deposit, redeem, fulfill, swap and margin ops need a snapshot younger than `max_price_age_ms` and no margin/spot op in flight.

| method | who | notes |
|---|---|---|
| `ft_on_transfer` | usdc | deposit: `usdc.ft_transfer_call(vault, amount, "")`, mints `amount * (supply+1) / (nav+1)` shares (1:1 when empty) |
| `request_redeem(shares) -> {id, assets}` | holder, 1 yocto | instant part from unreserved idle, rest escrowed + queued; `id` null if fully paid |
| `cancel_request(id)` | request owner | escrowed shares returned |
| `fulfill(id) -> assets` | keeper | pays at current NAV minus withdraw fee |
| `set_mode(market, "Flat"/"Hedged", reason_ref)` | keeper | one change per `cooldown_ms` per market |
| `swap(market, sell_base, amount_in, min_out)` | keeper | Ref `swap` on vault's Ref deposits; buy only when Hedged; sell keeps spot >= abs(short); out >= max(min_out, oracle - slippage) |
| `ref_deposit(amount)` / `ref_withdraw(amount)` | keeper | USDC idle <-> vault's Ref deposit |
| `deposit_margin(amount)` / `withdraw_margin(amount)` | keeper | USDC idle <-> exchange collateral |
| `add_vault_trading_key(public_key)` | owner | registers keeper's signing key on the exchange for vault orders |
| `set_config`, `set_keeper` | owner | |

Withdraw fee stays in the vault (accrues to remaining holders). Shares also implement NEP-141 core, storage management and `ft_metadata`.

Views: `config`, `mode(market)`, `last_mode_change_ms(market)`, `nav`, `spot_value`, `perp_equity`, `spot_size(market)` (1e8 units), `requests(id) -> {owner, shares} | null`, `next_request_id`, `total_queued_shares`, `idle`, `ref_usdc`, `snapshot`, `markets`, `keeper`, `exchange`.

Events (standard `maas-vault`): `config_set`, `mode_changed{market,mode,reason_ref}`, `withdraw_queued{id,owner,shares}`, `withdraw_fulfilled{id,owner,shares,assets}`, `withdraw_cancelled{id,owner,shares}`, `swapped{market,sell_base,amount_in,amount_out}`, `deposited{account_id,assets,shares}`, plus NEP-141 `ft_mint` / `ft_burn`.

## deploy (near-cli-rs, testnet)

```sh
NET=testnet; EX=exchange.maas.testnet; VAULT=vault.maas.testnet; USDC=usdc.fakes.testnet; REF=ref-finance-101.testnet
W=target/near

near contract deploy $EX use-file $W/perp_exchange/perp_exchange.wasm \
  with-init-call new json-args "{\"owner\":\"maas.testnet\",\"operator\":\"op.maas.testnet\",\"keeper\":\"keeper.maas.testnet\",\"fee_recipient\":\"fees.maas.testnet\",\"insurance\":\"ins.maas.testnet\",\"usdc\":\"$USDC\",\"max_price_age_ms\":60000}" \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config $NET sign-with-keychain send

# market 0 = BTC (20x), repeat for 1 ETH, 2 NEAR
near contract call-function as-transaction $EX set_market json-args \
  '{"market_id":0,"market":{"tick_size":"100000","lot_size":"10000","max_leverage":20,"imr_bps":500,"mmr_bps":250,"maker_fee_bps":2,"taker_fee_bps":5}}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as maas.testnet network-config $NET sign-with-keychain send

near contract deploy $VAULT use-file $W/delta_vault/delta_vault.wasm \
  with-init-call new json-args "{\"owner\":\"maas.testnet\",\"keeper\":\"keeper.maas.testnet\",\"usdc\":\"$USDC\",\"exchange\":\"$EX\",\"ref_exchange\":\"$REF\",\"markets\":[{\"base_token\":\"wbtc.fakes.testnet\",\"base_decimals\":8,\"ref_pool_id\":0},{\"base_token\":\"weth.fakes.testnet\",\"base_decimals\":18,\"ref_pool_id\":0},{\"base_token\":\"wrap.testnet\",\"base_decimals\":24,\"ref_pool_id\":0}],\"config\":{\"weights_bps\":[5000,3000,2000],\"short_leverage_bps\":10000,\"idle_buffer_bps\":1000,\"withdraw_fee_bps\":10,\"cooldown_ms\":3600000,\"price_band_bps\":100,\"slippage_bps\":50,\"size_cap\":[\"1000000000\",\"1000000000\",\"1000000000\"],\"max_price_age_ms\":60000}}" \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config $NET sign-with-keychain send
```

Post-deploy (each a `call-function as-transaction`):
- `$USDC storage_deposit {"account_id":"<EX>"}` and `{"account_id":"<VAULT>"}` (0.00125 NEAR each).
- `$REF storage_deposit {"account_id":"<VAULT>"}` (0.1 NEAR), then from vault owner flow register Ref tokens: `$REF register_tokens {"token_ids":[USDC, wbtc, weth, wnear]}` signed by the vault account (1 yocto).
- `$EX set_fee_exempt {"account_id":"<VAULT>","exempt":true}` (owner).
- `$VAULT add_vault_trading_key {"public_key":"ed25519:..."}` (owner, 30 Tgas) with the keeper's signing key.
- Fund vault account with NEAR: it pays 1 yocto per ft/Ref call and storage for share holders.
