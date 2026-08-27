#!/usr/bin/env sh
set -eu

EMAIL="${1:-}"
PASSWORD="${2:-}"
NAME="${3:-X-One Local Admin}"
ENV_FILE="${4:-.env}"

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
    echo "Usage: $0 <email> <password> [name] [env_file]"
    echo "Example: $0 admin@xone.local admin123 \"X-One Local Admin\" .env"
    exit 1
fi

if [ ${#PASSWORD} -lt 8 ] || [ ${#PASSWORD} -gt 128 ]; then
    echo "Error: Password must contain 8-128 characters." >&2
    exit 1
fi

if ! echo "$EMAIL" | grep -Eq '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'; then
    echo "Error: Email is not valid." >&2
    exit 1
fi

[ -f "$ENV_FILE" ] || ENV_FILE='.env.example'

docker compose --env-file "$ENV_FILE" exec -T \
    -e "LOCAL_ADMIN_EMAIL=$EMAIL" \
    -e "LOCAL_ADMIN_PASSWORD=$PASSWORD" \
    -e "LOCAL_ADMIN_NAME=$NAME" \
    api-gateway node dist/scripts/create-local-admin.js
