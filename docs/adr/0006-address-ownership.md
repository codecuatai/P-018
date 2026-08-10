# ADR-0006: Saved Address and Transaction Snapshot Ownership

- Status: Accepted decision for Phase 1+
- Date: 2026-08-10
- Owners: Core/Gateway, Food, Ride

## Decision

Core/Gateway owns the X-One saved address book. Food and Ride own immutable address snapshots captured in their transaction/order/booking records. A later edit to a saved address never mutates an old transaction snapshot.

The Gateway resolves a saved address through a future Core contract and passes the resulting normalized snapshot to the owning domain service. Food and Ride never query Core's database directly, add cross-database foreign keys, or import Core ORM/business models. Domain services validate and persist their own snapshot fields.

## Current compatibility

The current Food demo owns actor-scoped delivery addresses in Food and exposes them through its internal `/api/v1/addresses` route. This is a legacy compatibility boundary, not a change to the target ownership decision. No `user_addresses` migration is created in Phase 0.

## Migration path

Phase 1/2 will define Core saved-address CRUD and a Gateway resolver. Food's adapter will translate the current demo address response to the shared `Address` contract, then pass an immutable snapshot when creating an order. Existing Food orders remain readable from their stored snapshots; no backfill or cross-database mutation is required for the Phase 0 decision.

## Consequences

Address IDs are references at the Gateway boundary, not shared database identity. The authoritative owner of a saved address and the owner of a transaction snapshot remain distinct and testable.
