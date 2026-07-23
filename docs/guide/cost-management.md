---
title: "Quản lý chi phí API"
description: "Ước tính và tối ưu chi phí LLM API cho dự án AI20K"
weight: 98
---

# Quản lý chi phí API — Đừng để bill bất ngờ

Khi xây dựng AI Agent, mỗi lần gọi LLM (GPT-4, Claude, v.v.) đều tốn tiền. Nếu không kiểm soát, bạn có thể tiêu hết budget chỉ trong vài ngày testing. Phần này giúp bạn ước tính chi phí và áp dụng các chiến lược giảm cost.

---

## Ước tính chi phí cho AI20K

### Bảng giá tham khảo (tháng 5/2025)

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Phù hợp cho |
|-------|----------------------|------------------------|-------------|
| gpt-4o-mini | $0.15 | $0.60 | **Development + Production** |
| gpt-4o | $2.50 | $10.00 | Testing chất lượng cao |
| gpt-4.1-mini | $0.40 | $1.60 | Cân bằng cost/chất lượng |
| gpt-4.1 | $2.00 | $8.00 | Agent phức tạp |
| claude-sonnet-4-6 | $3.00 | $15.00 | Agent phức tạp |
| claude-haiku-4-5 | $0.80 | $4.00 | Development |

> 💡 **MẸO:** Dùng **gpt-4o-mini** cho toàn bộ quá trình development. Nó rẻ hơn gpt-4o ~17 lần nhưng vẫn đủ thông minh cho hầu hết tác vụ AI Agent. Chỉ chuyển sang model đắt hơn khi cần chất lượng output cao nhất cho Demo Day.

### Ước tính chi phí theo giai đoạn

**Giai đoạn Development (4-5 tuần):**
- Mỗi lần test agent: ~500-2000 tokens → ~$0.001-0.003
- Ngày code 4 giờ, test ~50 lần → ~$0.05-0.15/ngày
- 5 tuần development → **~$2-5 tổng cộng**

**Giai đoạn Evaluation:**
- Chạy 50-100 câu hỏi test, mỗi câu ~1000 tokens → ~$0.10-0.50
- Chạy 3-5 lần để tune → **~$0.50-2.50**

**Giai đoạn Demo Day:**
- Demo live ~10 phút, ~20 requests → **~$0.10**

**Tổng ước tính cho toàn bộ AI20K: ~$5-10** (với gpt-4o-mini)

---

## 8 chiến lược giảm chi phí

### 1. Dùng model rẻ nhất đủ cho task

```python
# ❌ Đắt — dùng gpt-4o cho mọi thứ
llm = ChatOpenAI(model="gpt-4o")

# ✅ Rẻ — dùng gpt-4o-mini cho development
llm = ChatOpenAI(model="gpt-4o-mini")

# ✅ Tối ưu — dùng model khác nhau cho task khác nhau
analyze_llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)  # Phân tích: rẻ, deterministic
generate_llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)  # Sinh text: rẻ, creative
```

### 2. Giới hạn max_tokens

```python
# ❌ Không giới hạn — LLM có thể sinh rất dài
llm = ChatOpenAI(model="gpt-4o-mini")

# ✅ Giới hạn output — tiết kiệm tokens
llm = ChatOpenAI(model="gpt-4o-mini", max_tokens=500)  # Đủ cho câu trả lời ngắn
llm = ChatOpenAI(model="gpt-4o-mini", max_tokens=1500)  # Đủ cho câu trả lời chi tiết
```

### 3. Temperature = 0 cho task phân tích

```python
# Task phân tích/routing — không cần creativity, giảm token waste
analyze_llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
```

### 4. Cache kết quả LLM trong development

```python
from functools import lru_cache
import hashlib
import json

# Cache đơn giản trong memory
_llm_cache: dict[str, str] = {}

def cached_llm_call(prompt: str, model: str = "gpt-4o-mini") -> str:
    """Cache LLM responses để tránh gọi lại cùng prompt."""
    cache_key = hashlib.md5(f"{model}:{prompt}".encode()).hexdigest()
    
    if cache_key in _llm_cache:
        return _llm_cache[cache_key]
    
    from langchain_openai import ChatOpenAI
    llm = ChatOpenAI(model=model)
    response = llm.invoke(prompt)
    _llm_cache[cache_key] = response.content
    return response.content
```

### 5. Mock LLM trong test

```python
# ❌ Tốn tiền — gọi LLM thật trong test
def test_analyze():
    result = analyze_node({"query": "test"})  # Gọi OpenAI API thật

# ✅ Miễn phí — mock LLM response
from unittest.mock import AsyncMock, patch

@pytest.mark.asyncio
async def test_analyze():
    with patch("langchain_openai.ChatOpenAI.ainvoke") as mock:
        mock.return_value = AsyncMock(content='{"query_type": "factual"}')
        result = await analyze_node({"query": "test"})
    assert result["query_type"] == "factual"
```

### 6. Rút gọn prompt — ít tokens hơn

```python
# ❌ Prompt dài — tốn input tokens
prompt = """Bạn là một trợ lý AI thông minh, được thiết kế để giúp đỡ người dùng
trả lời các câu hỏi về nhiều chủ đề khác nhau. Vui lòng phân tích câu hỏi sau
và xác định loại của nó..."""

# ✅ Prompt ngắn — tiết kiệm tokens
prompt = "Phân loại câu hỏi: factual, analytical, hoặc creative. Chỉ trả JSON."
```

### 7. Giới hạn số vòng lặp agent

```python
# ❌ Không giới hạn — agent có thể lặp 20+ lần
def should_continue(state):
    if state.get("needs_more"):
        return "research"
    return END

# ✅ Giới hạn 3 vòng — đủ cho hầu hết câu hỏi
MAX_ITERATIONS = 3

def should_continue(state):
    if state.get("iteration", 0) >= MAX_ITERATIONS:
        return END
    if state.get("needs_more"):
        return "research"
    return END
```

### 8. Monitor usage bằng LangSmith

LangSmith tự động track token usage cho mỗi LLM call. Kiểm tra dashboard định kỳ để phát hiện:
- Node nào tốn nhiều tokens nhất
- Có request bất thường không (agent lặp quá nhiều)
- Tổng chi phí theo ngày/tuần

---

## Thiết lập budget limit

### OpenAI Usage Limits

1. Vào https://platform.openai.com/settings/organization/billing
2. Set **Monthly budget limit** — ví dụ $20/tháng
3. Bật **Email notification** khi đạt 80% budget

### Cảnh báo trong code

```python
import os
import logging

logger = logging.getLogger(__name__)

# Ước tính cost per request
def estimate_cost(input_tokens: int, output_tokens: int, model: str = "gpt-4o-mini") -> float:
    """Ước tính chi phí USD cho một LLM call."""
    pricing = {
        "gpt-4o-mini": {"input": 0.15 / 1_000_000, "output": 0.60 / 1_000_000},
        "gpt-4o": {"input": 2.50 / 1_000_000, "output": 10.00 / 1_000_000},
    }
    p = pricing.get(model, pricing["gpt-4o-mini"])
    return input_tokens * p["input"] + output_tokens * p["output"]
```

---

## Tóm tắt

| Chiến lược | Tiết kiệm | Độ khó |
|------------|-----------|--------|
| Dùng gpt-4o-mini | ~17x so với gpt-4o | Dễ |
| Giới hạn max_tokens | 20-50% | Dễ |
| Mock LLM trong test | 100% test cost | Trung bình |
| Giới hạn iterations | 30-60% | Dễ |
| Rút gọn prompt | 10-30% | Dễ |
| Cache responses | 50-80% repeated queries | Trung bình |

> 🔑 **ĐIỂM CHÍNH:** Tổng chi phí cho toàn bộ AI20K với gpt-4o-mini chỉ khoảng **$5-10** — rất hợp lý cho sinh viên. Áp dụng các chiến lược trên để không bị bất ngờ với bill.
