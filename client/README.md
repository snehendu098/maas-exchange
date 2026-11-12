# client

Trading terminal and vault UI for MaaS Exchange on NEAR. Next.js + NEAR wallet selector.

| Route | What |
|---|---|
| `/trade/[market]` | Perp terminal |
| `/vault` | Vault deposit, withdraw |
| `/portfolio` | Account overview |
| `/leaderboard` | Trader ranking |

## Run

```sh
cp .env.example .env.local   # fill contract account ids
bun install
bun run dev                  # http://localhost:3000
```

`/api/prices` serves Pyth prices; without `HERMES_API_KEY` it falls back to static `refPrice` in `src/shared/config/markets.ts`.

## Checks

```sh
bun run test
bun run lint
bun run build
```
