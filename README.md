# MaaS Exchange

Delta-neutral vault + perp trading terminal on NEAR (offchain orderbook, onchain settlement).

| Path | What | Lang |
|---|---|---|
| `contracts/` | perp-exchange, delta-vault, maas-pool, perp-math | Rust (near-sdk) |
| `engine/` | matching engine (orderbook, risk) | Rust |
| `backend/` | gateway, settler, indexer, keeper, vault-keeper, mm-bot | Go |
| `proto/` | shared message schemas | Protobuf |
| `client/` | trading terminal + vault UI | Next.js |
| `infra/` | docker-compose (nats, postgres), deploy | — |

```sh
cp .env.example .env
make infra
make build
make test
```

## Testnet

| contract | account |
|---|---|
| perp-exchange | [`exchange.maas-keeper.testnet`](https://testnet.nearblocks.io/address/exchange.maas-keeper.testnet) |
| delta-vault | [`vault.maas-keeper.testnet`](https://testnet.nearblocks.io/address/vault.maas-keeper.testnet) |
| maas-pool | [`pool.maas-keeper.testnet`](https://testnet.nearblocks.io/address/pool.maas-keeper.testnet) |

```sh
make deploy-near            # .env: NEAR_MASTER_ACCOUNT, USDC_CONTRACT, NEAR_KEYCHAIN=legacy for ~/.near-credentials
infra/deploy/smoke.sh       # mint, seed pool 0, swap, show fee streaming to LPs
```

## Vault rules

- **Exit:** vault-keeper sets a market FLAT when every funding print in the last 3h is negative (close short, sell spot, hold USDC). Re-enters HEDGED on the first positive print.
- **Fees:** none on deposit or rebalance (vault is fee-exempt on the exchange and pays 0 in maas-pool). Withdraw fee (10 bps) only: half streamed to pool LPs, half to treasury.
- **JIT-safe spot pools:** maas-pool streams swap fees + rewards to LPs over 1h by liquidity x time, so liquidity added around one swap earns ~0.
