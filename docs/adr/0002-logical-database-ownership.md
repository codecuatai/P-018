# ADR-0002: Each service owns a logical database

Status: Accepted

## Context

One local PostgreSQL container is convenient, but shared schemas couple services.

## Decision

Use a database/user per service with no cross-database queries or foreign keys.

## Consequences

Services communicate through contracts; later deployment can split database instances.

## Clarification

Logical ownership is mandatory from the first slice. The current local Compose setup uses one PostgreSQL instance with separate logical databases/roles; physical instance/cluster separation remains deferred until measured operational or organizational needs justify it.

## Alternatives considered

One shared schema and shared database credentials.
