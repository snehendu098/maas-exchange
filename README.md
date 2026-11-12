# MaaS Exchange

Delta-neutral vault + perp trading terminal on NEAR (offchain orderbook, onchain settlement).

| Path | What | Lang |
|---|---|---|
| `contracts/` | perp-exchange, delta-vault, perp-math | Rust (near-sdk) |
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
