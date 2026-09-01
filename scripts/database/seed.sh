#!/usr/bin/env sh
set -eu
env_file="${1:-.env}"
[ -f "$env_file" ] || env_file='.env.example'
run_catalog_import() {
  docker compose --env-file "$env_file" run --rm --no-deps --build -T catalog-importer "$1" --apply
}

run_catalog_import food
run_catalog_import restaurant
run_catalog_import healthcare
docker compose --env-file "$env_file" exec -T healthcare-service python -m seeds.seed_demo_patient
docker compose --env-file "$env_file" exec -T restaurant-service python -m seeds.seed
docker compose --env-file "$env_file" exec -T ride-service python -m seeds.seed_demo_drivers
echo 'Food, Restaurant, Healthcare, and Ride development data applied.'
