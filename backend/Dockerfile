# docker build --build-arg SVC=gateway|indexer|keeper|settler|mm-bot|vault-keeper backend
FROM --platform=$BUILDPLATFORM golang:1.25 AS build
ARG SVC TARGETOS TARGETARCH
WORKDIR /src
COPY go.mod go.sum* ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    test -n "$SVC" && CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/svc ./cmd/$SVC

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/svc /app/svc
WORKDIR /app
ENTRYPOINT ["/app/svc"]
