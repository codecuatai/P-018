---
title: "Deliverables Checklist"
description: "Danh sách 10 deliverables và cách hoàn thành"
weight: 1
---

## 10 Deliverables BTC Yêu Cầu

### Chi tiết từng deliverable

#### 1. Source Code (GitHub)
- **Location:** Toàn bộ thư mục `src/`
- **Yêu cầu:** Code chạy được, có cấu trúc rõ ràng
- **Tips:** Follow template folder structure

#### 2. README.md
- **Location:** `/README.md`
- **Yêu cầu:** Problem → Solution → Tech Stack → Setup → Team
- **Tips:** Sử dụng template README.md đã có sẵn

#### 3. Architecture Diagram
- **Location:** `/docs/architecture_diagram.md`
- **Yêu cầu:** System diagram + Component descriptions
- **Tips:** Dùng Mermaid syntax (render trên GitHub)

#### 4. AI Logs
- **Yêu cầu:** Log các interaction với LLM
- **Tips:** Setup logging trong `main.py` hoặc dùng LangSmith

#### 5. Live URL / Deploy
- **Yêu cầu:** Sản phẩm chạy được trên internet
- **Tips:** Deploy backend lên Render/Railway, frontend lên Vercel

#### 6. Video Demo
- **Location:** Upload lên YouTube/Google Drive
- **Yêu cầu:** Tối đa 5 phút, demo feature chính
- **Tips:** Follow pitch structure trong `presentation/README.md`

#### 7. Pitch Deck
- **Location:** `/presentation/pitch_deck.pptx`
- **Yêu cầu:** 10 slides theo structure chuẩn
- **Tips:** Follow template trong `presentation/README.md`

#### 8. Weekly Journal
- **Location:** `/JOURNAL.md`
- **Yêu cầu:** Ghi lại mỗi tuần: mục tiêu, hoàn thành, khó khăn, bài học
- **Tips:** Template đã có sẵn, chỉ cần điền

#### 9. Worklog
- **Location:** `/WORKLOG.md`
- **Yêu cầu:** Ghi lại hàng ngày: ai làm gì, kết quả gì
- **Tips:** Template đã có sẵn, cập nhật mỗi ngày

#### 10. Evaluation Evidence
- **Location:** `/eval/results/report.md`
- **Yêu cầu:** Metrics, test results, user feedback
- **Tips:** Follow template trong `eval/results/report.md`

## Evaluation Criteria (BTC chấm 1-10)

1. **Product/Business** — README, metrics, user feedback
2. **System Design** — Architecture, diagram, folder structure
3. **UX/UI Design** — Responsive, dark mode, accessibility
4. **DevOps** — Docker, CI/CD, logging, .env
5. **Code Quality** — Type hints, naming, tests, no bare except

### Target: 35+/50 points

| Criteria | Minimum | How to achieve |
|----------|---------|---------------|
| Product | ≥ 8 | README đầy đủ, metrics, feedback |
| System | ≥ 7 | Architecture doc + Mermaid diagram |
| UI/UX | ≥ 7 | Responsive + dark mode |
| DevOps | ≥ 6 | Docker + CI/CD + logging |
| Code | ≥ 7 | Type hints + tests + ruff pass |
