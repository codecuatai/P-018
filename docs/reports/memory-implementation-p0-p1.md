# Memory implementation report: P0-P1

Status: IMPLEMENTED_SCHEMA_AND_CONTRACT

P0 contract and deterministic retrieval are implemented in `memory.ts`, with
actor isolation, expiry filtering, confidence/salience ranking and provenance
tests. P1 persistence is implemented by migration 014 and is now included in
both migration launchers. `conversation_states` remains a compatibility table.

The repository write/read adapter and production turn backfill are not claimed
until a PostgreSQL runtime check is available.
