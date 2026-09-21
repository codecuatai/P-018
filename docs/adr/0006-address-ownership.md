# ADR-0006: Saved Address and Transaction Snapshot Ownership

- Status: Accepted decision for Phase 1+
- Date: 2026-08-10
- Owners: Core/Gateway, Food, Ride

## Decision

Core/Gateway owns the X-One saved address book. Food and Ride own immutable address snapshots captured in their transaction/order/booking records. A later edit to a saved address never mutates an old transaction snapshot.

The Gateway resolves a saved address through the Core-owned actor-scoped address contract and passes the resulting normalized snapshot to the owning domain service. Food and Ride never query Core's database directly, add cross-database foreign keys, or import Core ORM/business models. Domain services validate and persist their own snapshot fields.

## Current compatibility

The legacy Food demo still owns actor-scoped delivery addresses in Food and exposes them through its internal `/api/v1/addresses` route. This is a compatibility boundary, not a second Core authority. Core's `user_addresses` table is implemented by migration `010_core_personal_context.sql`; public callers use Gateway `/api/v1/addresses` and `/api/v1/location/*`.

## Migration path

Phase 1/2 implementation defines Core saved-address CRUD and a Gateway resolver. Food's adapter translates the actor-owned Core address to the shared `Address` contract, then passes an immutable snapshot when creating an order. Existing Food orders remain readable from their stored snapshots; no backfill or cross-database mutation is required.

## Consequences

Address IDs are references at the Gateway boundary, not shared database identity. The authoritative owner of a saved address and the owner of a transaction snapshot remain distinct and testable.
