# Runtime Architecture

Each backend component has its own Docker image. Local Compose starts PostgreSQL, API gateway, agent, Ride, Restaurant, Healthcare, and Food over internal DNS: `agent-service`, `ride-service`, `restaurant-service`, `healthcare-service`, and `food-service`. The default Compose publishes only the Gateway; Agent/Food use `expose` for container-network access.

```mermaid
flowchart TB
  Host --> Gateway[api-gateway :3000]
  Gateway --> Agent[agent-service :8001]
  Gateway --> Ride[ride-service :8101]
  Gateway --> Restaurant[restaurant-service :8102]
  Gateway --> Healthcare[healthcare-service :8103]
  Gateway --> Food[food-service :8104]
  Gateway --> Postgres[(postgres :5432)]
```

Root `.env` interpolates Compose only; containers receive explicit least-privilege variables, never a shared `env_file`. `/health/live` reports process availability. Food `/health/ready` reports its connected repository and workflow worker state; Gateway `/health/ready` reports reconciliation worker state. Domain/agent partial failure is handled by gateway client timeout/error mapping; gateway does not block Compose startup on every domain service. PostgreSQL bootstrap runs only for a new volume. Future deployments split services and databases independently.

The Agent's optional Gemini adapter tries the configured model first and falls back to the configured `GEMINI_FALLBACK_MODEL` for quota/rate-limit/resource-exhaustion failures. The default local stack uses deterministic mode, so provider credentials are not required for the acceptance smoke. All public Restaurant and Healthcare turns still pass through Gateway confirmation/payment gates; the Agent only emits typed requests.
