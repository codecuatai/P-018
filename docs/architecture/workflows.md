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

The Food flow is implemented for the backend slice. Final writes require an idempotency key from the first request, confirmation bound to action/payload/version/price/expiry, audit metadata, and an authoritative Food result. Payment success ends the request at `PAID -> RESTAURANT_CONFIRMING`; Food's due-workflow worker/lazy reconciliation advances later states. Restaurant rejection and cancellation are reconciled to one idempotent refund.
