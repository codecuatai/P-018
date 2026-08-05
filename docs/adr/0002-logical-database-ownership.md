# ADR-0002: Each service owns a logical database

Status: Accepted

## Context

One local PostgreSQL container is convenient, but shared schemas couple services.

## Decision

Use a database/user per service with no cross-database queries or foreign keys.

## Consequences

Services communicate through contracts; later deployment can split database instances.

## Alternatives considered

One shared schema and shared database credentials.
