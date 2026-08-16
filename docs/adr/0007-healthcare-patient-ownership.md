# ADR-0007: Healthcare Patient Identity Ownership

- Status: Accepted decision for Phase 1/2
- Date: 2026-08-10
- Owners: Core/Gateway and Healthcare

## Decision

Core owns X-One user identity and authentication references. Healthcare owns the medical patient identity and medical data, including patient records, blood type, medical history, symptoms, doctor/slot/appointment relationships, and the `patient_user_links` actor mapping.

Core may hold only the minimum opaque reference needed for authorization/orchestration. Core must not store Healthcare medical history or become a second medical record owner. Gateway passes the authenticated actor and an explicit Healthcare patient reference through the contract; Healthcare validates access and owns patient state.

## Current compatibility

`HEALTHCARE_DEFAULT_PATIENT_ID` and the current demo patient seed are legacy/demo compatibility only. The Healthcare-owned `003_patient_user_links.sql` mapping and actor-scoped Gateway `/api/v1/healthcare/patients` boundary now provide the real local identity path. The fallback remains only for development/test when no explicit patient link is selected; production returns `PATIENT_LINK_REQUIRED` rather than silently selecting it.

## Migration path

Phase 1/2 added the Core identity/session boundary and a Healthcare-owned link/mapping contract, with authorization tests for actor-to-patient access. Existing appointments remain Healthcare-owned and retain their patient IDs. No patient migration is required; future production hardening may disable the development fallback entirely.

## Consequences

Healthcare API responses may return Healthcare-owned facility and patient/appointment facts. The Gateway may compose those facts but cannot invent, persist, or update medical data in Core.
