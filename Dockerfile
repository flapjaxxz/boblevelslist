# syntax=docker/dockerfile:1

# ---------- build stage ----------
FROM rust:1-bookworm AS builder

# Rust builds of this project are memory hungry; limit parallelism so small build machines survive.
ENV CARGO_BUILD_JOBS=2

# PostgreSQL is only needed to satisfy sqlx's compile-time query checks (see docker/build-with-db.sh)
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN bash docker/build-with-db.sh

# ---------- runtime stage ----------
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /app app

WORKDIR /app

COPY --from=builder /app/target/release/pointercrate-example ./target/release/pointercrate-example

# Static files and translation files are read from disk at runtime, relative to the working directory.
COPY --from=builder /app/pointercrate-core-pages/static ./pointercrate-core-pages/static
COPY --from=builder /app/pointercrate-demonlist-pages/static ./pointercrate-demonlist-pages/static
COPY --from=builder /app/pointercrate-user-pages/static ./pointercrate-user-pages/static
COPY --from=builder /app/pointercrate-example/static ./pointercrate-example/static

COPY start.sh ./start.sh
RUN chown -R app:app /app
USER app

# Rocket has to listen on all interfaces, on the port Render expects.
ENV ROCKET_ADDRESS=0.0.0.0 \
    ROCKET_PORT=10000
EXPOSE 10000

CMD ["sh", "start.sh"]
