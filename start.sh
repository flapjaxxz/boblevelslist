#!/usr/bin/env sh
# Start script used by Render (see render.yaml).
#
# Release builds of pointercrate refuse to start without a secret file for signing
# access tokens. Since .secret is (rightly) not committed to git, we create it here
# from the POINTERCRATE_SECRET environment variable.
set -eu

if [ ! -s .secret ]; then
    if [ -z "${POINTERCRATE_SECRET:-}" ]; then
        echo "POINTERCRATE_SECRET is not set (and there is no .secret file); refusing to start" >&2
        exit 1
    fi
    umask 077
    printf '%s' "$POINTERCRATE_SECRET" > .secret
fi

# Static files and translations are loaded relative to the working directory,
# so this script must be run from the repository root.
exec ./target/release/pointercrate-example
