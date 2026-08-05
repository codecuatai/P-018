#!/usr/bin/env sh
set -eu

create_role_and_database() {
  db_name="$1"
  db_user="$2"
  db_password="$3"

  psql --username "$POSTGRES_USER" --dbname postgres --set=ON_ERROR_STOP=1 \
    --set=db_name="$db_name" --set=db_user="$db_user" --set=db_password="$db_password" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'db_user')\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db_name')\gexec
SQL
}

create_role_and_database "$CORE_DB_NAME" "$CORE_DB_USER" "$CORE_DB_PASSWORD"
create_role_and_database "$AGENT_DB_NAME" "$AGENT_DB_USER" "$AGENT_DB_PASSWORD"
create_role_and_database "$RIDE_DB_NAME" "$RIDE_DB_USER" "$RIDE_DB_PASSWORD"
create_role_and_database "$RESTAURANT_DB_NAME" "$RESTAURANT_DB_USER" "$RESTAURANT_DB_PASSWORD"
create_role_and_database "$HEALTHCARE_DB_NAME" "$HEALTHCARE_DB_USER" "$HEALTHCARE_DB_PASSWORD"
create_role_and_database "$FOOD_DB_NAME" "$FOOD_DB_USER" "$FOOD_DB_PASSWORD"
