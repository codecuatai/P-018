# Tool Contracts

A tool is a governed domain capability, not a raw REST endpoint. The Tool Registry belongs to the gateway. The agent can only emit the versioned JSON-schema request in `packages/contracts/tools/`; it cannot invoke a tool itself.

| Risk | Example behavior | Confirmation |
| --- | --- | --- |
| `READ` | search availability | no |
| `REVERSIBLE_WRITE` | hold/reserve | policy-dependent |
| `FINANCIAL_OR_FINAL` | confirm booking/payment | required |

Lifecycle: agent proposes → gateway validates JSON schema and authorization → gateway creates audit/tool-call record → confirmation if needed → gateway calls a typed domain adapter with correlation/idempotency headers → gateway stores outcome and returns safe result. Contracts must state input/output, idempotency, timeout, and error mapping.
