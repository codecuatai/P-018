---
title: "State Management"
description: "Định nghĩa State schema cho LangGraph agent"
weight: 1
---

## State Schema

State là "bộ nhớ" của agent, truyền giữa các nodes:

```python
from typing import TypedDict

class AgentState(TypedDict, total=False):
    query: str        # Input từ user
    context: str      # Context từ RAG
    analysis: str     # Kết quả phân tích
    response: str     # Response cuối cùng
    error: str        # Error nếu có
    metadata: dict    # Extra info
```

## Nguyên tắc thiết kế State

### 1. Dùng TypedDict

```python
# ✅ TỐT — TypedDict cho state
class AgentState(TypedDict, total=False):
    query: str
    response: str

# ❌ TỆ — Không dùng Pydantic cho LangGraph state
class AgentState(BaseModel):
    query: str  # LangGraph expects TypedDict
```

### 2. total=False cho optional fields

```python
class AgentState(TypedDict, total=False):
    query: str           # Input (luôn có)
    context: str         # Optional — chỉ có khi dùng RAG
    error: str           # Optional — chỉ có khi lỗi
```

### 3. Chỉ thêm fields thực sự cần

- Mỗi field = data được truyền giữa nodes
- Không dùng state như "trash can" chứa mọi thứ
- Thêm docstring cho từng field

### 4. State更新 pattern

```python
# Mỗi node chỉ return fields nó thay đổi
async def analyze_node(state: AgentState) -> dict:
    query = state.get("query", "")
    analysis = await process(query)
    return {"analysis": analysis}  # Chỉ update "analysis"
```
