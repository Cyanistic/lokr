FROM node:22-bookworm-slim AS client-builder

WORKDIR /app/client

ARG LOKR_COMMIT_HASH=unknown
ENV LOKR_COMMIT_HASH=${LOKR_COMMIT_HASH}

COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

FROM rust:1.98-bookworm AS api-builder

WORKDIR /app/api

COPY api/Cargo.toml api/Cargo.lock api/build.rs ./
COPY api/.sqlx ./.sqlx
COPY api/migrations ./migrations
COPY api/src ./src

ENV SQLX_OFFLINE=true
RUN cargo build --release --locked

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install --no-install-recommends --yes ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/api

COPY --from=api-builder /app/api/target/release/lokr-api /usr/local/bin/lokr-api
COPY --from=client-builder /app/client/dist /app/client/dist

ENV XDG_DATA_HOME=/data
ENV LOKR_HOST=lokr.cyanistic.com

EXPOSE 6969
VOLUME ["/data"]

ENTRYPOINT ["/usr/local/bin/lokr-api"]
