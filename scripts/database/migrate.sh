#!/usr/bin/env sh
set -eu
env_file="${1:-.env}"
[ -f "$env_file" ] || env_file='.env.example'

echo "Checking PostgreSQL readiness..."
until docker compose --env-file "$env_file" exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1
done

export PGOPTIONS="-c lock_timeout=10000 -c statement_timeout=120000"

echo "Terminating lingering client connections before DDL migrations..."
docker compose --env-file "$env_file" exec -T postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname IN ('xone_core', 'xone_agent')
  AND pid <> pg_backend_pid();
" > /dev/null 2>&1 || true

echo "Applying Core and Agent migrations..."
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/001_core_vertical_slice.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/002_core_persistence_slice.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/003_core_atomicity.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/004_core_recovery.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/005_core_payment_provider_saga.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/006_core_payment_recovery_claims.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/007_core_assistant_action_executions.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/008_core_assistant_action_recovery.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/009_core_auth.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/010_core_personal_context.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/011_core_multi_service_workflows.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/012_core_product_ops.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/013_core_admin_support_idempotency.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/014_core_memory_system.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/015_core_api_keys.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/016_core_token_usage.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/017_core_four_roles_rbac.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/018_core_seed_four_roles.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/019_core_provider_offerings.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/020_core_audit_and_feature_flags.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/021_core_mcp_provider.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/022_core_customer_extensions.sql
docker compose --env-file "$env_file" exec -T postgres psql -U core_user -d xone_core -v ON_ERROR_STOP=1 < apps/api-gateway/migrations/023_core_provider_connected_services.sql
docker compose --env-file "$env_file" exec -T postgres psql -U agent_user -d xone_agent -v ON_ERROR_STOP=1 < apps/agent-service/migrations/001_agent_workflow_states.sql
docker compose --env-file "$env_file" exec -T postgres psql -U agent_user -d xone_agent -v ON_ERROR_STOP=1 < apps/agent-service/migrations/002_agent_run_metadata.sql
echo 'Core and Agent migrations applied successfully.'
echo 'Note: Domain services (Food, Restaurant, Healthcare, Ride) migrations are managed in P-018-Service.'
