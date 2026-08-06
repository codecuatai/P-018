# System Overview

X-One is a conversational platform for multi-domain booking and ordering. It is backend-first: web and mobile have one public backend, while a NestJS gateway centrally orchestrates agent and domain capabilities.

Principles: domain ownership, REST/JSON/OpenAPI contracts, explicit confirmation for important side effects, idempotent writes, and least-privilege data/environment access. Public traffic ends at the gateway; all remaining links are private service links.

```mermaid
flowchart LR
  Web[Web] --> Gateway[NestJS Gateway]
  Mobile[Mobile] --> Gateway
  Gateway --> Agent[AI Agent]
  Gateway --> Ride[Ride]
  Gateway --> Restaurant[Restaurant]
  Gateway --> Healthcare[Healthcare]
  Gateway --> Food[Food]
```

```mermaid
flowchart TB
  Client --> Gateway
  Gateway --> Workflow[Workflow / Confirmation / Tools / Audit]
  Workflow --> Agent
  Workflow --> Domains[Domain service clients]
```

Current implementation is a foundation: health/config boundaries exist; agent retains a deterministic demo; domain services, gateway workflows, payments, and real booking/order APIs are skeleton/planned. The evidence-backed component matrix, ports, local commands, and limits live in the canonical [current architecture state](current-state.md). Non-goals are queues, service mesh, Kubernetes, Redis, multi-agent orchestration, and production payment/authentication in this foundation.
