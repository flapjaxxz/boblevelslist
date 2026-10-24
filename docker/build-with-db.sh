#!/usr/bin/env bash
# Builds pointercrate-example inside the Docker build stage.
#
# pointercrate uses sqlx's compile-time checked queries (`sqlx::query!`), which need a database
# with the pointercrate schema to exist while compiling. Platforms like Render do not provide
# one during the build, so we start a throwaway PostgreSQL server here, apply all migrations to
# it, compile against it, and shut it down again. Nothing from this database ends up in the final
# image; the real database is only used at runtime (and migrated by the app on startup).
set -euo pipefail

PGBIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -n 1)"
PGDIR=/tmp/pg-build
PGPORT=54329 # unusual port so we can never clash with a server installed by apt

rm -rf "$PGDIR"
mkdir -p "$PGDIR"
chown postgres:postgres "$PGDIR"

as_postgres() {
    su postgres -s /bin/bash -c "$*"
}

stop_db() {
    as_postgres "$PGBIN/pg_ctl -D $PGDIR/data -m immediate stop" >/dev/null 2>&1 || true
}
trap stop_db EXIT

as_postgres "$PGBIN/initdb -D $PGDIR/data -A trust" >/dev/null
as_postgres "$PGBIN/pg_ctl -D $PGDIR/data -l $PGDIR/log -w -o '-p $PGPORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=$PGDIR' start" >/dev/null

PSQL=("$PGBIN/psql" -h 127.0.0.1 -p "$PGPORT" -v ON_ERROR_STOP=1 -q)

# The initial migration grants privileges to a role called `pointercrate`.
"${PSQL[@]}" -U postgres -d postgres -c "CREATE ROLE pointercrate LOGIN SUPERUSER"
"${PSQL[@]}" -U postgres -d postgres -c "CREATE DATABASE pointercrate OWNER pointercrate"

# sqlx migrations are plain SQL files that run in filename (= timestamp) order.
for migration in $(ls migrations/*.up.sql | sort); do
    "${PSQL[@]}" -U pointercrate -d pointercrate -f "$migration" >/dev/null 2>&1 || {
        echo "Applying $migration failed:" >&2
        "${PSQL[@]}" -U pointercrate -d pointercrate -f "$migration" >&2 || true
        exit 1
    }
done

export DATABASE_URL="postgresql://pointercrate@127.0.0.1:$PGPORT/pointercrate"
cargo build --release --locked -p pointercrate-example
