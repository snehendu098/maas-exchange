.PHONY: infra build test

infra:
	docker compose -f infra/docker/docker-compose.yml up -d

build:
	cd contracts && cargo build --target wasm32-unknown-unknown --release
	cd engine && cargo build
	cd backend && go build ./...
	cd client && bun run build

test:
	cd contracts && cargo test
	cd engine && cargo test
	cd backend && go test ./...
