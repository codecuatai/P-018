# ADR-0007: Healthcare Patient Identity Ownership

- Status: Accepted decision for Phase 1/2
- Date: 2026-08-10
- Owners: Core/Gateway and Healthcare

## Decision

Core owns X-One user identity and authentication references. Healthcare owns the medical patient identity and medical data, including patient records, blood type, medical history, symptoms, doctor/slot/appointment relationships, and future patient-to-user links such as `patient_user_links`.

Core may hold only the minimum opaque reference needed for authorization/orchestration. Core must not store Healthcare medical history or become a second medical record owner. Gateway passes the authenticated actor and an explicit Healthcare patient reference through the contract; Healthcare validates access and owns patient state.

## Current compatibility

`HEALTHCARE_DEFAULT_PATIENT_ID` and the current demo patient seed are legacy/demo compatibility only. They are not a user-to-patient identity model. The current local vertical slice keeps them so existing deterministic demos and tests remain runnable. The Gateway must not silently treat the fallback as production identity; the real product path requires an authenticated actor-to-patient link.

## Migration path

Phase 1/2 will add the Core identity/session boundary and a Healthcare-owned link/mapping contract, with authorization tests for actor-to-patient access. Existing appointments remain Healthcare-owned and retain their patient IDs. The fallback is removed or disabled for the real product path after the link contract is available; no patient migration is required in Phase 0.

## Consequences

Healthcare API responses may return Healthcare-owned facility and patient/appointment facts. The Gateway may compose those facts but cannot invent, persist, or update medical data in Core.
