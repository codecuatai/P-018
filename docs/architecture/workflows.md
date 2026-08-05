# Workflows

## General chat and tools

```mermaid
sequenceDiagram
  participant C as Client
  participant G as Gateway
  participant A as Agent
  participant D as Domain
  C->>G: /api/v1 request
  G->>A: structured context
  A-->>G: typed tool request or reply
  G->>D: validated internal REST call
  D-->>G: authoritative result
  G-->>C: safe response + correlation ID
```

## Food ordering (target flow)

```mermaid
sequenceDiagram
  participant U as User
  participant G as Gateway
  participant A as Agent
  participant F as Food
  U->>G: delivery intent/address
  G->>A: structured context
  A-->>G: food search tool request
  G->>F: search menu/options
  F-->>G: authoritative options
  U->>G: select items
  G-->>U: confirmation request
  U->>G: explicit confirmation
  G->>F: create/confirm order after payment sandbox
```

The food flow is architectural only: no food business endpoint or payment integration exists. Final writes require an idempotency key from the first request, confirmation bound to the action/payload/version/price/expiry, audit, and an authoritative domain result. Deliver this as a walking vertical slice before introducing more deployment boundaries.
