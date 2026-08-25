#!/usr/bin/env sh
set -eu
env_file="${1:-.env}"
[ -f "$env_file" ] || env_file='.env.example'
python scripts/dataops/catalog_import.py food --apply
python scripts/dataops/catalog_import.py restaurant --apply
python scripts/dataops/catalog_import.py healthcare --apply
docker compose --env-file "$env_file" exec -T restaurant-service python -m seeds.seed
echo 'Restaurant booking resources applied to imported catalog rows.'
