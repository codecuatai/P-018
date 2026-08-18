# ADR-0003: Use synchronous REST for the demo

Status: Accepted

## Context

The foundation needs inspectable, low-operational-complexity communication.

## Decision

Use REST/JSON/OpenAPI with bounded timeouts, correlation IDs, and idempotency.

## Consequences

No queue, broker, event sourcing, or CQRS framework is introduced now.

## Alternatives considered

Kafka, RabbitMQ, and asynchronous event choreography.
