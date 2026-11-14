# docker build -f engine/Dockerfile .  (repo root ctx: needs proto/ + infra/nats/)
FROM rust:1-bookworm AS build
WORKDIR /src
COPY proto/ proto/
COPY infra/nats/ infra/nats/
COPY engine/Cargo.toml engine/Cargo.lock engine/
COPY engine/crates/ engine/crates/
RUN cd engine && cargo build --release -p engine && mkdir /data

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=build /src/engine/target/release/engine /app/engine
COPY --from=build --chown=nonroot:nonroot /data /data
ENV ENGINE_SNAPSHOT_PATH=/data/engine.snapshot
ENTRYPOINT ["/app/engine"]
