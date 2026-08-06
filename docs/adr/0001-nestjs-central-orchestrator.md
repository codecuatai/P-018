# ADR-0001: NestJS is the central orchestrator

Status: Accepted

## Context

Clients need one stable public backend while workflows span conversational and domain concerns.

## Decision

NestJS API Gateway owns public APIs, workflows, confirmation, payment sandbox, audit, and domain adapters.

## Consequences

Domain services stay independent; the gateway becomes the orchestration boundary.

## Alternatives considered

Direct frontend-to-service calls; letting the AI agent orchestrate domains.
