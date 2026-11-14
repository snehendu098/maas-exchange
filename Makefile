.PHONY: infra up down gen wasm deploy-near build test test-integration
COMPOSE := docker compose -f infra/docker/docker-compose.yml
BUF := go run github.com/bufbuild/buf/cmd/buf@v1.74.0

# nats + postgres only
infra:
	$(COMPOSE) up -d

# + engine and go svcs, against NEAR_NETWORK from root .env
up:
	$(COMPOSE) --profile svc up -d --build

down:
	$(COMPOSE) --profile svc down

# go -> backend/gen, rust via engine/crates/proto build.rs
gen:
	cd proto && $(BUF) generate
	cd engine && cargo build -p proto

# cargo near sets cfg(near); plain cargo wasm uses offchain fallbacks
wasm:
	cd contracts && for c in perp-exchange delta-vault; do \
	  cargo near build non-reproducible-wasm --no-abi --manifest-path $$c/Cargo.toml --out-dir target/near || exit 1; done

# sub-accounts + deploy + init, see infra/deploy/near.sh
deploy-near: wasm
	infra/deploy/near.sh

build: wasm
	cd engine && cargo build
	cd backend && go build ./...
	cd client && bun run build

test:
	cd contracts && cargo test
	cd engine && cargo test
	cd backend && go test ./...

# needs docker. wipes ENGINE_IN/ENGINE_OUT streams on local nats
test-integration:
	$(COMPOSE) up -d nats
	cd engine && cargo test -p engine --test nats -- --ignored --test-threads=1
