---
title: "Cohort 1 Mistakes"
description: "Phân tích lỗi từ 12 teams Cohort 1"
weight: 1
---

## Top 10 Mistakes (Cohort 1)

Phân tích từ 12 teams, đây là những lỗi phổ biến nhất:

### 1. Bare except — 3/12 teams

```python
# ❌ Lỗi: Che mọi lỗi, không biết gì fail
try:
    result = await process(data)
except:
    pass

# ✅ Fix: Specific exception
try:
    result = await process(data)
except ValueError as e:
    logger.error(f"Invalid data: {e}")
    return {"error": str(e)}
```

### 2. Hardcoded Secrets — 1/12 teams

```python
# ❌ API key lộ trong code
client = OpenAI(api_key="sk-abc123...")

# ✅ Dùng .env + config
from src.config import get_settings
settings = get_settings()
client = OpenAI(api_key=settings.openai_api_key)
```

### 3. No Tests — Hầu hết teams

```python
# Chỉ 2/12 teams có tests
# Template đã có sẵn test structure — chỉ cần viết thêm
```

### 4. No CI/CD — 0/12 teams

```yaml
# Template đã có .github/workflows/ci.yml
# Chỉ cần push lên GitHub → CI tự chạy
```

### 5. Functions quá dài

```python
# ❌ 1 function 200+ lines
def process_everything(data):
    # ... 200 lines ...

# ✅ Tách thành nhiều functions
async def analyze(data: str) -> dict:
    """5-10 lines"""
    ...

async def transform(result: dict) -> dict:
    """5-10 lines"""
    ...
```

### 6. Không có Architecture Diagram

- 5/12 teams thiếu diagram
- BTC chấm System Design thấp → mất 2-3 points

### 7. README thiếu

- 6/12 teams README kém
- Thiếu: problem statement, tech stack, setup guide

### 8. Không có Evaluation Evidence

- Chỉ 2/12 teams có
- BTC không thấy bằng chứng testing → điểm thấp

### 9. Tất cả code trong 1 file

- 4/12 teams có main.py > 500 lines
- Khó maintain, khó test, khó review

### 10. Không type hints

- Code quality giảm → mất 1-2 points

## Common Weaknesses by Score

### Bottom Tier (27-30 points)

| Team | Score | Main Issues |
|------|-------|------------|
| 004 | 27.9 | System design 2.5, DevOps 1.5 |
| 006 | 28.8 | Code quality 4.1, System 6.0 |
| 012 | 28.9 | Product 4.8, DevOps 3.8 |
| 011 | 29.3 | DevOps 2.0, bare except |
| 001 | 32.0 | Code quality 3.3 |

### Pattern chung: DevOps + Code Quality = điểm thấp nhất
