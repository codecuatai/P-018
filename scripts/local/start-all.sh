#!/usr/bin/env bash
set -Eeuo pipefail

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

seed_demo=false
compose_args=()
for arg in "$@"; do
    if [[ "$arg" == "--seed-demo" ]]; then
        seed_demo=true
    else
        compose_args+=( "$arg" )
    fi
done

timeout_seconds="${START_ALL_TIMEOUT_SECONDS:-180}"
if ! [[ "$timeout_seconds" =~ ^[0-9]+$ ]] || (( timeout_seconds < 30 || timeout_seconds > 900 )); then
    echo "ERROR: START_ALL_TIMEOUT_SECONDS must be an integer from 30 to 900." >&2
    exit 2
fi

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

command -v docker >/dev/null 2>&1 || fail "docker is required."
command -v curl >/dev/null 2>&1 || fail "curl is required."

if [[ ! -f .env ]]; then
    if [[ -x ./scripts/setup/setup-env.sh ]]; then
        ./scripts/setup/setup-env.sh
    else
        fail ".env is missing and scripts/setup/setup-env.sh is unavailable."
    fi
fi

if command -v python >/dev/null 2>&1; then
    python scripts/quality/validate-env-config.py
elif command -v python3 >/dev/null 2>&1; then
    python3 scripts/quality/validate-env-config.py
else
    fail "python or python3 is required for environment validation."
fi

echo "Starting X-One Compose services..."
docker compose --env-file .env up --build -d "${compose_args[@]}"

required_services=(
    postgres
    api-gateway
    web
    agent-service
    ride-service
    restaurant-service
    healthcare-service
    food-service
)

get_health() {
    local service="$1"
    local container_id
    container_id="$(docker compose --env-file .env ps -q "$service")"
    [[ -n "$container_id" ]] || { echo "missing"; return; }
    docker inspect --format '{{if not .State.Running}}stopped{{else if not .State.Health}}running{{else}}{{.State.Health.Status}}{{end}}' "$container_id"
}

wait_healthy() {
    local started="$SECONDS"
    while (( SECONDS - started < timeout_seconds )); do
        local all_ready=true
        for service in "${required_services[@]}"; do
            local status
            status="$(get_health "$service")"
            if [[ "$status" != "healthy" ]]; then
                all_ready=false
                if [[ "$status" == "unhealthy" || "$status" == "stopped" || "$status" == "missing" ]]; then
                    echo "Waiting: $service is $status" >&2
                fi
            fi
        done
        [[ "$all_ready" == true ]] && return 0
        sleep 2
    done
    for service in "${required_services[@]}"; do
        echo "  $service: $(get_health "$service")" >&2
    done
    fail "Compose health checks did not become healthy within ${timeout_seconds}s."
}

wait_http() {
    local url="$1"
    local started="$SECONDS"
    while (( SECONDS - started < timeout_seconds )); do
        if curl --fail --silent --show-error --max-time 5 "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
    done
    fail "HTTP readiness check failed: $url"
}

wait_healthy

echo "Running idempotent service migrations..."
./scripts/database/migrate.sh .env

if [[ "$seed_demo" == true ]]; then
    echo "Running explicit deterministic demo seeds..."
    ./scripts/database/seed.sh .env
fi

wait_healthy

normalize_gateway_host() {
    local host="$1"
    if [[ "$host" == "0.0.0.0" || "$host" == "127.0.0.1" || "$host" == "::" || "$host" == "[::]" ]]; then
        printf '%s\n' "localhost"
    else
        printf '%s\n' "$host"
    fi
}

gateway_port="$(docker compose --env-file .env port api-gateway 3000 | head -n 1)"
gateway_host="${gateway_port%:*}"
gateway_bound_port="${gateway_port##*:}"
gateway_host="$(normalize_gateway_host "$gateway_host")"
gateway_url="http://${gateway_host}:${gateway_bound_port}"
wait_http "${gateway_url}/health/ready"

web_port="$(docker compose --env-file .env port web 3000 | head -n 1)"
web_host="${web_port%:*}"
web_bound_port="${web_port##*:}"
web_host="$(normalize_gateway_host "$web_host")"
web_url="http://${web_host}:${web_bound_port}"
wait_http "${web_url}/api/health"

echo ""
echo "X-One started successfully."
echo "  Web:     ${web_url}"
echo "  Gateway: ${gateway_url}"
echo "  Internal services: Compose DNS only (agent-service, ride-service, restaurant-service, healthcare-service, food-service)"
