#!/usr/bin/env sh
set -eu
env_file="${1:-.env}"
[ -f "$env_file" ] || env_file='.env.example'
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
docker compose --env-file "$env_file" exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1 < services/food-service/migrations/001_food_vertical_slice.sql
docker compose --env-file "$env_file" exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1 < services/food-service/migrations/002_food_workflow_concurrency.sql
docker compose --env-file "$env_file" exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1 < services/food-service/migrations/003_food_atomicity.sql
docker compose --env-file "$env_file" exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1 < services/food-service/migrations/004_food_authoritative_operations.sql
docker compose --env-file "$env_file" exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1 < services/food-service/migrations/005_food_idempotency_eligibility.sql
docker compose --env-file "$env_file" exec -T postgres psql -U food_user -d xone_food -v ON_ERROR_STOP=1 < services/food-service/migrations/006_food_catalog_provenance.sql
docker compose --env-file $env_file exec -T postgres psql -U agent_user -d xone_agent -v ON_ERROR_STOP=1 < apps/agent-service/migrations/001_agent_workflow_states.sql
echo 'Core, Agent and Food migrations applied.'
docker compose --env-file "$env_file" exec -T restaurant-service alembic upgrade head
echo 'Restaurant Service migrations applied.'
docker compose --env-file "$env_file" exec -T postgres psql -U healthcare_user -d xone_healthcare -v ON_ERROR_STOP=1 < services/healthcare-service/migrations/001_healthcare_booking.sql
docker compose --env-file "$env_file" exec -T postgres psql -U healthcare_user -d xone_healthcare -v ON_ERROR_STOP=1 < services/healthcare-service/migrations/002_healthcare_slot_reuse.sql
docker compose --env-file "$env_file" exec -T postgres psql -U healthcare_user -d xone_healthcare -v ON_ERROR_STOP=1 < services/healthcare-service/migrations/003_patient_user_links.sql
docker compose --env-file "$env_file" exec -T postgres psql -U healthcare_user -d xone_healthcare -v ON_ERROR_STOP=1 < services/healthcare-service/migrations/003a_healthcare_legacy_catalog_bridge.sql
docker compose --env-file "$env_file" exec -T postgres psql -U healthcare_user -d xone_healthcare -v ON_ERROR_STOP=1 < services/healthcare-service/migrations/004_healthcare_catalog_provenance.sql
docker compose --env-file "$env_file" exec -T postgres psql -U healthcare_user -d xone_healthcare -v ON_ERROR_STOP=1 < services/healthcare-service/migrations/005_healthcare_catalog_nullable_price.sql
echo 'Healthcare Service migrations applied.'
docker compose --env-file "$env_file" exec -T ride-service alembic upgrade head
echo 'Ride Service migrations applied.'
