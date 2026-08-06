# ADR-0004: One agent and a NestJS Tool Gateway

Status: Accepted

## Context

LLM reasoning should not directly mutate authoritative systems.

## Decision

One FastAPI/LangGraph agent produces structured tool requests; NestJS validates and executes them.

## Consequences

Side effects are auditable and confirmation-controlled; no multi-agent system is needed.

## Alternatives considered

Direct agent-to-domain calls and multi-agent orchestration.
