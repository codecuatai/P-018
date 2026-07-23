---
title: "BMAD-v6 Overview"
description: "Tổng quan về BMAD Method và cách áp dụng"
weight: 1
---

## BMAD Method là gì?

**BMAD** (Build More Architect Dreams) là framework mã nguồn mở cho AI-driven software development.

- **GitHub:** github.com/bmad-code-org/BMAD-METHOD
- **Docs:** docs.bmad-method.org
- **License:** MIT (free)
- **IDE:** Claude Code, Cursor, Codex CLI

## 6 Agents mặc định

| Agent | Name | Role |
|-------|------|------|
| Analyst | Mary | Business Analyst |
| PM | John | Product Manager |
| Architect | Winston | System Architect |
| Developer | Amelia | Senior Developer |
| UX Designer | Sally | UX Designer |
| Tech Writer | Paige | Technical Writer |

## 4-Phase Workflow

### Phase 1: Analysis
- Brainstorming, research, product briefs

### Phase 2: Planning
- PRD creation, UX design

### Phase 3: Solutioning
- Architecture, ADRs, epic/story breakdown

### Phase 4: Implementation
- Sprint planning, story implementation, code review

## Folder Structure

```
project/
├── _bmad/                    ← BMAD core
│   ├── _config/              ← Config
│   ├── bmm/                  ← Module config
│   ├── custom/               ← Customizations
│   └── scripts/              ← Helper scripts
├── _bmad-output/             ← Output
│   ├── planning-artifacts/   ← Phase 1-3
│   └── implementation-artifacts/ ← Phase 4
├── docs/                     ← Documentation
└── src/                      ← Source code
```

## Khi nào dùng BMAD?

- **YES** — Project phức tạp, cần planning kỹ
- **YES** — Team muốn structured workflow
- **NO** — Project nhỏ, quick prototype
- **NO** — Team chưa quen với AI-assisted development
