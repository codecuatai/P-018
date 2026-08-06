#!/usr/bin/env sh
set -eu
env_file="${1:-.env}"
[ -f "$env_file" ] || env_file='.env.example'
docker compose --env-file "$env_file" exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1 < services/food-service/seeds/001_demo_hanoi.sql
echo 'Deterministic Food demo seed applied.'
