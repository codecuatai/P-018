#!/usr/bin/env sh
set -eu
env_file="${1:-.env}"
[ -f "$env_file" ] || env_file='.env.example'
run_catalog_import() {
  docker compose --env-file "$env_file" run --rm --no-deps --build -T catalog-importer "$1" --apply
}

echo 'Domain services seed data (Food, Restaurant, Healthcare, Ride) is managed in P-018-Service.'
echo 'Please run `sh scripts/database/seed.sh` inside P-018-Service repository.'

