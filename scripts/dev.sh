#!/usr/bin/env sh
set -eu
exec docker compose up --build "$@"
