# Generated TypeScript Clients

**This directory contains only this README** — no client code is checked in.

Versioned OpenAPI contracts do exist (eight of them, in [packages/contracts/openapi/](../contracts/openapi/)), so the earlier reason for this directory being empty no longer applies. The current reason is a deliberate choice: the API Gateway talks to domain services through small hand-owned typed adapters in `apps/api-gateway/src/clients/` with runtime response validation, and no generated-client toolchain is configured.

If a toolchain is introduced:

- Generate from `packages/contracts/openapi/*.yaml` only.
- Never hand-edit output in this directory — regenerate instead.
- Never add business logic here. This package is transport shape only.

Status: `planned`. See [current architecture state](../../docs/architecture/current-state.md).
