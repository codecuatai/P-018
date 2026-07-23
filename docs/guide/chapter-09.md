---
title: "Nộp bài Demo Day"
weight: 9
---

## 9.1 Mười deliverables BTC yêu cầu

Ban Tổ Chức (BTC) AI20K yêu cầu mỗi đội nộp **10 deliverables** cho Demo Day. Tỷ lệ hoàn thành phổ biến như sau (ước tính từ kinh nghiệm):

| # | Deliverable | Mức độ phổ biến | Độ khó | Mẹo |
|---|-------------|-----------------|--------|-----|
| 1 | Source Code (GitHub repo) | Phần lớn hoàn thành | Trung bình | Push code sớm, không đợi hoàn hảo |
| 2 | README.md | Phần lớn hoàn thành | Dễ | Dùng template, có screenshot |
| 3 | Architecture Diagram | Thường bị thiếu | Trung bình | Dùng draw.io hoặc Mermaid |
| 4 | AI Logs (LangSmith/screenshot) | Phần lớn hoàn thành | Dễ | Chỉ cần config 3 env vars |
| 5 | Live URL | Thường hoàn thành | Trung bình | Deploy lên Render, free tier OK |
| 6 | Video Demo | Hiếm khi có | Trung bình | Quay 3-5 phút, upload YouTube |
| 7 | Pitch Deck (slide thuyết trình) | Thường bị thiếu | Khó | 10 slides theo template |
| 8 | Development Journal | Phần lớn hoàn thành | Dễ | Ghi mỗi ngày, không cần dài |
| 9 | Worklog (commit history) | Phần lớn hoàn thành | Dễ | Git log tự động |
| 10 | Evaluation Evidence | Hiếm khi có | Khó | RAGAS metrics + test results |

Phân tích nhanh: deliverables dễ nhất là AI Logs và Worklog — không cần code phức tạp, chỉ cần discipline. Deliverables khó nhất là Video Demo, Pitch Deck, và Evaluation Evidence — đây cũng là nơi bạn tạo lợi thế cạnh tranh lớn nhất.

Mỗi deliverable cần được đặt đúng vị trí trong GitHub repository:

```
project-root/
├── README.md              ← Deliverable #2
├── docs/
│   ├── architecture.md    ← Deliverable #3 (hoặc .png/.pdf)
│   ├── video-demo.md      ← Deliverable #6 (link YouTube)
│   ├── pitch-deck.pdf     ← Deliverable #7
│   ├── journal.md         ← Deliverable #8
│   ├── worklog.md         ← Deliverable #9
│   └── evaluation.md      ← Deliverable #10
├── src/                   ← Deliverable #1 (Source Code)
├── tests/                 ← Cho Evaluation Evidence
├── .github/workflows/     ← Bonus cho DevOps
├── Dockerfile             ← Bonus cho DevOps
└── docker-compose.yml     ← Bonus cho DevOps
```

> 🔑 **ĐIỂM CHÍNH:** 10/10 deliverables = điểm tối đa ở tiêu chí "Hoàn thành deliverables". Nhiều đội mất điểm không phải vì code kém mà vì thiếu deliverables. Thực tế cho thấy đa số đội chỉ hoàn thành khoảng 5/10 deliverables — tức là nộp đủ 10/10 đã vượt phần lớn các đội khác.

### Chi tiết từng deliverable

**1. Source Code:** Push toàn bộ code lên GitHub. Repo nên có cấu trúc rõ ràng, `.gitignore` đúng, không chứa secrets, không chứa file lớn (>10MB). BTC sẽ clone và chạy thử — đảm bảo code chạy được sau khi set env vars.

**2. README.md:** File README là ấn tượng đầu tiên. Phải có: tên dự án, mô tả, screenshot/gif, hướng dẫn cài đặt, cách chạy, cấu trúc thư mục, tech stack, team members. Xem template ở mục 9.2.

**3. Architecture Diagram:** Sơ đồ kiến trúc thể hiện bạn hiểu hệ thống. Dùng draw.io (miễn phí), Mermaid (trong README), hoặc Excalidraw. Vẽ rõ: Frontend, Backend API, LangGraph Agent, Vector Store, External APIs.

**4. AI Logs:** Chứng minh agent hoạt động đúng. Cách dễ nhất: dùng LangSmith (3 env vars, không cần code thêm). Hoặc screenshot terminal output cho thấy agent reasoning steps.

**5. Live URL:** URL truy cập được từ internet. Deploy lên Render (backend), Vercel (frontend). Free tier chấp nhận được. Đảm bảo URL hoạt động ít nhất đến hết ngày Demo Day + 7 ngày.

**6. Video Demo:** Quay màn hình 3-5 phút, đi qua main features. Upload YouTube (unlisted OK). Nên có: giới thiệu team, demo main use case, giải thích architecture, demo edge case. Rất hiếm đội có video — đây là lợi thế cạnh tranh lớn.

**7. Pitch Deck:** Slide thuyết trình cho Demo Day. Thường 10 slides, mỗi slide 1 phút. Xem template chi tiết ở mục 9.6.

**8. Development Journal:** Nhật ký phát triển, ghi lại: quyết định kỹ thuật và lý do, khó khăn gặp phải và cách giải quyết, bài học rút ra. Không cần dài — 2-3 câu mỗi ngày đủ.

**9. Worklog:** Lịch sử phát triển, chứng minh team làm việc đều đặn. Cách dễ nhất: `git log --oneline --since="2024-01-01" > worklog.md`. Hoặc export GitHub contribution graph.

**10. Evaluation Evidence:** Bằng chứng đánh giá chất lượng agent. Xem chương 8 phần 8.5 và 8.6. Rất hiếm đội nộp deliverable này — đây là cơ hội ghi điểm lớn.

## 9.2 Checklist chi tiết

Dưới đây là checklist từng bước để đảm bảo không bỏ sót deliverables. In ra hoặc copy vào Notion/Trello, check từng mục trước khi nộp.

### Checklist Source Code

- [ ] Repository GitHub public hoặc add BTC làm collaborator
- [ ] Code chạy được sau khi set env vars (README có hướng dẫn)
- [ ] `.gitignore` đúng (không chứa `.env`, `__pycache__`, `.venv`)
- [ ] Không commit secrets (API keys, passwords)
- [ ] Không commit file lớn (models, datasets >10MB)
- [ ] Có `requirements.txt` hoặc `pyproject.toml` với pinned versions
- [ ] Code có type hints
- [ ] Code có docstrings cho functions chính
- [ ] Có ít nhất 1 file test (pytest)

### Checklist README.md

- [ ] Tên dự án và mô tả rõ ràng
- [ ] Screenshot hoặc GIF của ứng dụng
- [ ] Hướng dẫn cài đặt (step-by-step)
- [ ] Hướng dẫn chạy (và chạy với Docker nếu có)
- [ ] Cấu trúc thư mục (tree)
- [ ] Tech stack (bảng hoặc badges)
- [ ] Environment variables cần thiết (liệt kê tên, không ghi giá trị)
- [ ] API documentation (endpoints, request/response format)
- [ ] Team members (tên, vai trò)
- [ ] Link Live URL

### Checklist Architecture Diagram

- [ ] Sơ đồ rõ ràng, dễ đọc
- [ ] Thể hiện đầy đủ components (Frontend, Backend, Agent, DB, External APIs)
- [ ] Có data flow arrows (mũi tên luồng dữ liệu)
- [ ] File format: PNG hoặc SVG (embed trong README)
- [ ] Có mô tả ngắn kèm sơ đồ

### Checklist AI Logs

- [ ] LangSmith project URL (share publicly hoặc screenshot)
- [ ] Hoặc: screenshot terminal logs cho thấy agent reasoning
- [ ] Ít nhất 5-10 trace examples
- [ ] Mỗi trace cho thấy: input, LLM call, retrieval, output

### Checklist Live URL

- [ ] URL trả về HTTP 200 khi truy cập
- [ ] Health check endpoint hoạt động (`/health`)
- [ ] API endpoints chính hoạt động
- [ ] URL được ghi trong README
- [ ] URL hoạt động ổn định (không sleep — dùng UptimeRobot nếu free tier)

### Checklist Video Demo

- [ ] Video 3-5 phút, chất lượng HD
- [ ] Upload YouTube (unlisted OK)
- [ ] Link YouTube ghi trong README hoặc `docs/video-demo.md`
- [ ] Video có: giới thiệu team, demo use case chính, demo edge case
- [ ] Audio rõ ràng, có phụ đề tốt hơn

### Checklist Pitch Deck

- [ ] 10 slides theo template (xem mục 9.6)
- [ ] File PDF (không PowerPoint — tránh font/format issues)
- [ ] Thêm vào `docs/pitch-deck.pdf`
- [ ] Thực hành trình bày trong 10 phút

### Checklist Journal + Worklog

- [ ] Journal: ít nhất 5-7 entries, mỗi entry 2-3 câu
- [ ] Worklog: git log hoặc bảng commit history
- [ ] Cả hai lưu trong `docs/`

### Checklist Evaluation Evidence

- [ ] Bảng test results (pytest output + coverage)
- [ ] Bảng RAGAS metrics (hoặc tự đánh giá)
- [ ] Performance metrics (response time)
- [ ] User feedback (ít nhất 3-5 người)
- [ ] Code traceability (map test case → feature)

> 💡 **MẸO:** Tạo GitHub Issue hoặc Notion checklist ngay tuần đầu tiên. Check off từng mục khi hoàn thành. Đừng đến tuần cuối mới chạy checklist — lúc đó đã quá muộn để quay video hay viết journal.

## 9.3 Tiêu chí chấm điểm

BTC chấm điểm theo 5 tiêu chí, mỗi tiêu chí thang điểm 1-10. Điểm tối đa = 50 điểm. Dưới đây là phân tích từng tiêu chí và cách ghi điểm tối đa.

### 5 tiêu chí chấm điểm

| Tiêu chí | Trọng số | Mô tả |
|----------|----------|-------|
| Product/Business | 20% | Giá trị sản phẩm, market fit, business model |
| System Design | 20% | Kiến trúc, scalability, tech stack choice |
| UI/UX | 20% | Giao diện, trải nghiệm người dùng, accessibility |
| DevOps | 20% | Docker, CI/CD, deployment, monitoring |
| Code Quality | 20% | Code style, tests, error handling, documentation |

Phân tích: DevOps thường là tiêu chí có điểm trung bình thấp nhất — đây là cơ hội lớn để ghi điểm. Chỉ cần có Docker + CI/CD + health check, bạn đã đạt 7-8/10 ở tiêu chí này.

### Cách tối đa hóa từng tiêu chí

**Product/Business (target: 8+/10)**
- Thể hiện rõ problem statement và target user
- Demo use case thực tế, không phải toy example
- Có market sizing hoặc competitor analysis
- Business model khả thi (dù đơn giản)
- Minimum: giải quyết 1 pain point cụ thể cho 1 nhóm user cụ thể

**System Design (target: 8+/10)**
- Architecture diagram rõ ràng, professional
- Giải thích được tại sao chọn tech stack này
- Hệ thống có thể scale (dù chỉ về mặt lý thuyết)
- Error handling ở mọi layer
- Minimum: có diagram + giải thích design decisions trong README

**UI/UX (target: 7+/10)**
- Giao diện sạch sẽ, responsive, dùng được trên mobile
- Loading states cho LLM calls (spinner, skeleton)
- Error messages thân thiện (không hiện raw exception)
- Ít nhất 2-3 screens/views
- Minimum: giao diện không bị lỗi, có thể chat với agent

**DevOps (target: 8+/10)**
- Dockerfile multi-stage + Docker Compose
- GitHub Actions CI (lint + test + build)
- Live URL hoạt động ổn định
- Health check endpoint
- Structured logging + LangSmith tracing
- Minimum: Live URL + Docker + bất kỳ CI/CD nào

**Code Quality (target: 8+/10)**
- Type hints cho tất cả functions
- Docstrings cho public APIs
- Tests với 60%+ coverage
- No bare except, no hardcoded secrets
- Consistent code style (Ruff lint pass)
- Minimum: code chạy + có tests + không có anti-patterns

### Mục tiêu điểm số cho AI20K

| Mục tiêu | Tổng điểm | Cần đạt ở mỗi tiêu chí |
|----------|-----------|------------------------|
| Top 3 | 40+/50 | 8+ ở mỗi tiêu chí |
| Top 5 | 37+/50 | 7.5+ ở mỗi tiêu chí |
| Top 8 | 35+/50 | 7+ ở mỗi tiêu chí |
| Pass | 30+/50 | 6+ ở mỗi tiêu chí |

Để đạt kết quả tốt (top), cần khoảng 35+ điểm. Để pass an toàn, cần khoảng 30 điểm. Mỗi tiêu chí 7+/10 là mục tiêu tối thiểu.

> 🔑 **ĐIỂM CHÍNH:** Chiến lược tối ưu: đảm bảo 7+ ở mọi tiêu chí trước, rồi đẩy 1-2 tiêu chí lên 9+. Không tập trung hết vào 1 tiêu chí mà bỏ qua các tiêu chí khác. DevOps là tiêu chí dễ ghi điểm nhất vì đa số đội bỏ qua phần này.

## 9.4 Những lỗi phổ biến cần tránh

Kinh nghiệm thực tiễn cho thấy những lỗi sau đây lặp đi lặp lại ở nhiều đội. Hiểu và tránh những lỗi này là cách nhanh nhất để cải thiện điểm số.

### Top 5 lỗi phổ biến nhất

**Lỗi #1: Không có CI/CD**

Hầu hết các đội không thiết lập CI/CD pipeline. Đây là lỗi nghiêm trọng nhất vì nó ảnh hưởng trực tiếp đến tiêu chí DevOps. Không có CI/CD nghĩa là code không được test tự động, không được lint tự động, và deploy bằng tay — không chuyên nghiệp.

```yaml
# SAI: Không có .github/workflows/
# (thư mục không tồn tại)

# ĐÚNG: .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install -r requirements.txt
      - run: pytest tests/ -v
```

**Lỗi #2: Không có test**

Đa số các đội không có test tự động, code coverage = 0%. BTC không thể verify code hoạt động đúng, dẫn đến điểm Code Quality thấp.

```python
# SAI: Không có thư mục tests/
# (hoặc tests/ rỗng)

# ĐÚNG: tests/test_api.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
```

**Lỗi #3: Bare except**

Bắt exception với `except:` hoặc `except Exception` mà không log hay handle cụ thể. Đây là anti-pattern nghiêm trọng — nó che giấu bugs và làm debug cực kỳ khó khăn.

```python
# SAI: Bare except
try:
    result = llm.invoke(prompt)
except:  # Bắt mọi thứ, che giấu lỗi
    pass

# SAI: except Exception quá rộng
try:
    result = llm.invoke(prompt)
except Exception:
    pass  # Vẫn che giấu lỗi

# ĐÚNG: Bắt cụ thể + log
import logging
logger = logging.getLogger(__name__)

try:
    result = llm.invoke(prompt)
except openai.APIError as e:
    logger.error(f"LLM API error: {e}")
    raise HTTPException(status_code=503, detail="AI service unavailable")
except openai.RateLimitError:
    logger.warning("Rate limit hit, retrying...")
    # Retry logic
except ValidationError as e:
    logger.error(f"Validation error: {e}")
    raise HTTPException(status_code=422, detail=str(e))
```

**Lỗi #4: Hardcoded secrets**

Nhiều đội commit API key trực tiếp vào source code trên GitHub. Đây là lỗi bảo mật nghiêm trọng — key có thể bị ai đó sử dụng trái phép, tốn tiền.

```python
# SAI: Hardcoded API key
openai_client = OpenAI(api_key="sk-proj-abc123...")
DATABASE_URL = "postgresql://admin:password123@localhost/db"

# ĐÚNG: Dùng environment variables
import os
from dotenv import load_dotenv

load_dotenv()
openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///local.db")
```

```python
# .env (không commit vào git!)
OPENAI_API_KEY=sk-proj-abc123...
DATABASE_URL=postgresql://user:pass@host/db
```

```text
# .gitignore (luôn có dòng này)
.env
```

**Lỗi #5: Thiếu Evaluation Evidence**

Gần như không có đội nào nộp bằng chứng đánh giá chất lượng AI agent. Đây là deliverable thường bị bỏ qua nhất, nhưng lại là cơ hội ghi điểm lớn nhất.

## 9.5 Tips ghi điểm từ kinh nghiệm thực tiễn

Kinh nghiệm từ các đội đạt kết quả cao cho thấy những điểm chung tạo nên sự khác biệt.

### Điểm chung của top teams

**1. Đủ 10 deliverables.** Các đội đạt điểm cao nộp đủ hoặc gần đủ tất cả deliverables (9-10/10). Đội yếu chỉ nộp 4-5/10. Deliverables hoàn chỉnh = tín hiệu chuyên nghiệp.

**2. Code có cấu trúc rõ ràng.** Top teams tổ chức code theo cấu trúc module: `app/api/`, `app/agent/`, `app/core/`, `app/models/`. Không dump tất cả code vào 1-2 file. Mỗi module có `__init__.py` và职责 rõ ràng.

```text
# Cấu trúc tốt (ví dụ)
app/
├── __init__.py
├── main.py              # FastAPI app
├── api/
│   ├── __init__.py
│   ├── health.py        # Health endpoints
│   └── chat.py          # Chat endpoints
├── agent/
│   ├── __init__.py
│   ├── graph.py         # LangGraph graph
│   ├── nodes.py         # Agent nodes
│   ├── state.py         # State definition
│   └── tools.py         # Agent tools
├── core/
│   ├── __init__.py
│   ├── config.py        # Settings
│   └── logging_config.py
├── models/
│   ├── __init__.py
│   └── schemas.py       # Pydantic models
└── services/
    ├── __init__.py
    └── vector_store.py  # Vector store service

# Cấu trúc kém (ví dụ)
app.py                   # Tất cả trong 1 file
agent.py                 # Tất cả agent logic
```

**3. README chuyên nghiệp.** Top teams có README với: screenshot, architecture diagram, installation guide, API docs, team info. README là thứ BTC đọc đầu tiên — ấn tượng đầu tiên quyết định tone của toàn bộ đánh giá.

**4. Có tests.** Dù ít, top teams có ít nhất 5-10 test cases cho API endpoints và agent nodes. Bottom teams có 0 tests.

**5. Docker + deployment.** Top teams có Dockerfile và Live URL hoạt động. Bottom teams không Dockerize hoặc Live URL không hoạt động.

### Tips cụ thể để ghi điểm

**Tip 1: README "vàng"** — README là deliverable ROI (return on investment) cao nhất. 30 phút viết README tốt đáng giá hơn 3 tiếng thêm feature. BTC đọc README trước khi xem code. README tốt = điểm +1-2 ở mọi tiêu chí.

**Tip 2: Deploy sớm** — Deploy trong tuần đầu tiên, ngay cả khi app chỉ có 1 endpoint `/health`. Deploy sớm cho bạn thời gian fix deployment issues. Nhiều đội deploy ngày cuối và gặp lỗi không kịp fix.

**Tip 3: Screenshot mọi thứ** — Screenshot: running app, API docs (/docs), test output, LangSmith traces, Docker running, CI/CD green checks. Cho tất cả vào README hoặc `docs/`. Bằng chứng hình ảnh mạnh hơn text.

**Tip 4: Git history đều đặn** — Commit thường xuyên (hàng ngày), message rõ ràng. BTC xem git history để đánh giá effort và tiến độ. 50 commits trong 4 tuần tốt hơn 3 commits ngày cuối.

```bash
# Tốt: commit message rõ ràng
git commit -m "feat: add RAG retrieval node with ChromaDB"
git commit -m "fix: handle empty query in chat endpoint"
git commit -m "test: add integration tests for chat API"

# Kém: commit message chung chung
git commit -m "update"
git commit -m "fix"
git commit -m "wip"
```

**Tip 5: Nộp Evaluation Evidence** — Rất hiếm đội có deliverable này. Đây là "low-hanging fruit" (trái hái thấp) — ít effort, nhiều điểm. Chạy pytest + RAGAS, screenshot kết quả, viết bảng metrics. Xong trong 1-2 ngày.

## 9.6 Pitch Deck — Slide thuyết trình

Pitch Deck là bài thuyết trìnhDemo Day — thường 10 phút cho 10 slides. Đây là deliverable có completion rate thấp (33%) nhưng ảnh hưởng lớn đến ấn tượng BTC. Slide tốt + thuyết trình tốt = điểm thuyết phục ở mọi tiêu chí.

### Cấu trúc 10 slides

**Slide 1: Title (Tiêu đề)**
- Tên dự án
- Tagline (1 câu mô tả)
- Tên team + logo
- Ngày Demo Day

**Slide 2: Problem (Vấn đề)**
- Mô tả pain point cụ thể
- Ai đang gặp vấn đề? (target user)
- Tần suất/mức độ nghiêm trọng
- Số liệu nếu có (ví dụ: "70% sinh viên không biết sử dụng AI")

**Slide 3: Solution (Giải pháp)**
- Giải pháp của bạn giải quyết vấn đề như thế nào
- Khác biệt với các giải pháp hiện có
- Demo screenshot hoặc mockup

**Slide 4: Product Demo (Sản phẩm)**
- Screenshot hoặc GIF demo thực tế
- Highlight main features
- User flow chính

**Slide 5: Architecture (Kiến trúc)**
- Architecture diagram (đơn giản, dễ hiểu)
- Giải thích tech stack choices
- Tại sao chọn LangGraph? Tại sao chọn vector store này?

**Slide 6: AI/LLM Approach (Cách tiếp cận AI)**
- RAG pipeline, Agent design, Prompt strategy
- LangGraph graph diagram
- Evaluation metrics (RAGAS hoặc custom)

**Slide 7: Technical Highlights (Điểm nổi bật kỹ thuật)**
- CI/CD pipeline
- Test coverage
- Performance metrics
- DevOps setup

**Slide 8: Demo Video (Video demo)**
- Embed video hoặc QR code link YouTube
- 2-3 phút demo main use case

**Slide 9: Challenges & Learnings (Thách thức & Bài học)**
- Khó khăn lớn nhất và cách giải quyết
- Bài học kỹ thuật
- Nếu làm lại, bạn sẽ thay đổi gì?

**Slide 10: Team & Next Steps (Team & Bước tiếp theo)**
- Team members + vai trò
- Roadmap tiếp theo (nếu có thời gian phát triển thêm)
- Cảm ơn + Q&A

### Tips cho slide và thuyết trình

**Slide design:**
- Mỗi slide chỉ 1 idea chính
- Font size tối thiểu 24pt (BTC ngồi xa)
- Hình ảnh > text (1 hình = 1000 từ)
- Dark background + light text (projector tốt hơn)
- Không quá 30 từ mỗi slide

**Thuyết trình:**
- Thực hành ít nhất 3 lần trước Demo Day
- Time rehearsal: 10 slides × 1 phút = 10 phút
- Chỉ có người nói chuyện, không ai đọc slide
- Demo live rủi ro — có video backup sẵn
- Chuẩn bị cho Q&A: "Làm sao bạn xử lý hallucination?" "Scale thế nào?"

> 💡 **MẸO:** BTC sẽ hỏi về technical decisions. Chuẩn bị câu trả lời cho: "Tại sao chọn LangGraph thay vì CrewAI/AutoGen?", "Làm sao giảm hallucination?", "Cost per request là bao nhiêu?", "Làm sao scale khi có 1000 users đồng thời?"

## Tóm tắt

Trong chương này, chúng ta đã tìm hiểu mọi thứ cần biết để nộp bài Demo Day thành công:

- **10 deliverables** BTC yêu cầu — Video Demo và Evaluation Evidence thường bị bỏ qua nhất, là cơ hội ghi điểm lớn nhất
- **Checklist chi tiết** cho từng deliverable — không bỏ sót gì
- **5 tiêu chí chấm điểm** — DevOps là tiêu chí dễ cải thiện nhất
- **Top 5 lỗi phổ biến** — Không có CI/CD, Không có test, Bare except, Hardcoded secrets, Thiếu Evaluation Evidence
- **Tips từ các đội đạt điểm cao** — README chuyên nghiệp, deploy sớm, commit đều, screenshot mọi thứ
- **Pitch Deck 10 slides** — template hoàn chỉnh cho Demo Day

Cuối cùng, hãy nhớ: Demo Day không chỉ là thi — nó là cơ hội thể hiện kỹ năng engineering và teamwork. BTC đánh giá tổng thể, không chỉ code. Deliverables đầy đủ + code sạch + thuyết trình tốt = chiến thắng.

## Checklist cuối cùng trước khi nộp

- [ ] 10/10 deliverables đã hoàn thành?
- [ ] README có screenshot, install guide, API docs?
- [ ] Live URL hoạt động (test trên browser khác + incognito)?
- [ ] Tests chạy pass (pytest green)?
- [ ] Không có hardcoded secrets trong code?
- [ ] Không có bare except?
- [ ] Docker build thành công?
- [ ] CI/CD pipeline xanh (GitHub Actions green)?
- [ ] Git history đều đặn (không phải 5 commits ngày cuối)?
- [ ] Pitch Deck đã thực hành thuyết trình 3+ lần?
