#!/usr/bin/env sh
set -eu
echo 'Applying deterministic Restaurant Service seeds...'
docker compose exec -T restaurant-service python -m seeds.seed
echo 'Restaurant Service seeds applied.'
