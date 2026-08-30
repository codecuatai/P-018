#!/usr/bin/env sh
set -eu

env_file="${1:-.env}"
[ -f "$env_file" ] || env_file='.env.example'

query_food_rows() {
  docker compose --env-file "$env_file" exec -T food-service python -c '
import asyncio
import os
import sys

import asyncpg


async def main() -> None:
    connection = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        print(await connection.fetchval(sys.argv[1]))
    finally:
        await connection.close()


asyncio.run(main())
' "$1"
}

query_service_rows() {
  service="$1"
  statement="$2"
  docker compose --env-file "$env_file" exec -T "$service" python -c '
import os
import sys

import psycopg

with psycopg.connect(os.environ["DATABASE_URL"]) as connection:
    print(connection.execute(sys.argv[1]).fetchone()[0])
' "$statement"
}

require_rows() {
  label="$1"
  service="$2"
  statement="$3"
  minimum="$4"
  if [ "$service" = 'food-service' ]; then
    count="$(query_food_rows "$statement")"
  else
    count="$(query_service_rows "$service" "$statement")"
  fi
  case "$count" in
    ''|*[!0-9]*)
      echo "Seed validation returned a non-numeric count for $label: $count" >&2
      exit 1
      ;;
  esac
  if [ "$count" -lt "$minimum" ]; then
    echo "Seed validation failed for $label: expected at least $minimum row(s), found $count." >&2
    exit 1
  fi
  echo "Seed validation: $label = $count"
}

require_rows 'Food active catalog version' food-service "SELECT COUNT(*) FROM catalog_dataset_versions WHERE is_active=TRUE" 1
require_rows 'Food restaurants' food-service "SELECT COUNT(*) FROM food_catalog WHERE record_type='restaurant' AND is_active=TRUE" 1
require_rows 'Food menu items' food-service "SELECT COUNT(*) FROM food_catalog WHERE record_type='menu_item' AND is_active=TRUE" 1
require_rows 'Restaurant active catalog version' restaurant-service "SELECT COUNT(*) FROM catalog_dataset_versions WHERE is_active=TRUE" 1
require_rows 'Restaurants' restaurant-service "SELECT COUNT(*) FROM restaurants WHERE active=TRUE" 1
require_rows 'Restaurant tables' restaurant-service "SELECT COUNT(*) FROM restaurant_tables WHERE active=TRUE" 1
require_rows 'Restaurant opening hours' restaurant-service "SELECT COUNT(*) FROM restaurant_opening_hours" 1

active_restaurant_count="$(query_service_rows restaurant-service "SELECT COUNT(*) FROM restaurants WHERE active=TRUE")"
demo_ready_restaurant_count="$(query_service_rows restaurant-service "SELECT COUNT(*) FROM (SELECT r.id FROM restaurants r JOIN restaurant_tables t ON t.restaurant_id=r.id WHERE r.active=TRUE AND t.active=TRUE AND t.table_code LIKE 'DEMO-XONE-%' AND t.capacity>=12 GROUP BY r.id HAVING COUNT(*)>=32) AS ready_restaurants")"
case "$active_restaurant_count" in
  ''|*[!0-9]*)
    echo "Seed validation returned a non-numeric active-restaurant count." >&2
    exit 1
    ;;
esac
case "$demo_ready_restaurant_count" in
  ''|*[!0-9]*)
    echo "Seed validation returned a non-numeric restaurant capacity count." >&2
    exit 1
    ;;
esac
if [ "$active_restaurant_count" -ne "$demo_ready_restaurant_count" ]; then
  echo "Seed validation failed for Restaurant demo capacity: $demo_ready_restaurant_count of $active_restaurant_count active restaurants have 32 demo tables." >&2
  exit 1
fi
echo "Seed validation: Restaurant demo capacity = $demo_ready_restaurant_count of $active_restaurant_count active restaurants"

require_rows 'Healthcare active catalog version' healthcare-service "SELECT COUNT(*) FROM catalog_dataset_versions WHERE is_active=TRUE" 1
require_rows 'Healthcare facilities' healthcare-service "SELECT COUNT(*) FROM healthcare_facilities WHERE is_active=TRUE" 1
require_rows 'Healthcare priced doctors' healthcare-service "SELECT COUNT(*) FROM doctors WHERE is_active=TRUE AND price IS NOT NULL" 1
require_rows 'Healthcare future slots' healthcare-service "SELECT COUNT(*) FROM time_slots WHERE status='AVAILABLE' AND start_time > CURRENT_TIMESTAMP" 1
require_rows 'Ride active tariffs' ride-service "SELECT COUNT(*) FROM ride_tariffs WHERE active=TRUE" 3
require_rows 'Ride available drivers' ride-service "SELECT COUNT(*) FROM ride_drivers WHERE availability_status='AVAILABLE'" 36

demo_auth_enabled="$(docker compose --env-file "$env_file" exec -T healthcare-service python -c "import os; print(os.environ.get('DEMO_AUTH_ENABLED', 'false').lower())")"
if [ "$demo_auth_enabled" = 'true' ]; then
  require_rows 'Healthcare development demo patient' healthcare-service "SELECT COUNT(*) FROM patients" 1
  require_rows 'Healthcare development demo patient link' healthcare-service "SELECT COUNT(*) FROM patient_user_links WHERE is_default=TRUE" 1
fi

echo 'Development seed data is complete.'
