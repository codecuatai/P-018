# OpenAPI Contracts

Versioned service OpenAPI descriptions belong here. Generate clients into
packages/generated-ts-clients/; do not hand-edit generated output.

- agent-service.v1.yaml describes the internal, authenticated interpretation
  endpoint and its typed state-patch/tool-request response.
- ride-service.v1.yaml describes internal quote and booking lifecycle endpoints,
  including idempotency and the two confirmation boundaries.
- gateway-public.v1.yaml describes the browser-facing Ride chat and two explicit
  confirmation actions.

The current Gateway uses small typed adapters with runtime response validation.
No generated-client toolchain is configured yet; do not hand-edit generated
output when one is introduced.
