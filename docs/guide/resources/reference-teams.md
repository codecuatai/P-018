---
title: "Reference Teams (Cohort 1)"
description: "Top practices từ 12 teams Cohort 1"
weight: 2
---

## Phân tích Cohort 1

### Xếp hạng tổng thể

| Rank | Team | Score | Strengths |
|------|------|-------|-----------|
| 1 | A20-App-010 | 39.6/50 | Product 10, System 9, UI 8.5 |
| 2 | A20-App-007 | 38.3/50 | Best code quality, Clean Architecture |
| 3 | A20-App-008 | 37.6/50 | Good all-around |
| 4 | A20-App-003 | 37.1/50 | Best LangGraph implementation |
| 5 | A20-App-002 | 37.0/50 | Best multi-agent architecture |

### Best Practices by Category

#### README (Reference: Team 011)
- Table of contents with anchor links
- "Important links" table (demo, video, slides)
- Environment variable table with Required/Default/Description
- Step-by-step setup guide

#### Architecture (Reference: Team 007)
- Clean Architecture layers
- CQRS pattern
- ADR (Architecture Decision Records)

#### LangGraph Agent (Reference: Team 003)
- `state.py` (TypedDict) + `pipeline.py` (graph builder) + `nodes/` directory
- Conditional edges with retry logic
- Singleton compiled pipeline

#### Docker (Reference: Team 001)
- Multi-stage Alpine build
- Non-root user
- HEALTHCHECK directive
- `--mount=type=cache` for pip

#### Evaluation Evidence (Reference: Team 011)
- RAGAS evaluation with 50 golden samples
- Test scenario table with pass/fail
- User feedback quotes with ratings
- Explicit answers to evaluation questions

### Common Weaknesses (PHẢI TRÁNH)

| Issue | Teams affected | Impact |
|-------|---------------|--------|
| No CI/CD | 12/12 | DevOps score thấp |
| No tests | 10/12 | Code quality thấp |
| Bare except | 3/12 | Code quality giảm |
| Hardcoded secrets | 1/12 | Security risk |
| Missing Evaluation Evidence | 10/12 | Product score thấp |
| No Video Demo | 12/12 | Missing deliverable |
