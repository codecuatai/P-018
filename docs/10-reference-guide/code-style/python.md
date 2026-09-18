---
title: "Python Code Style"
description: "Chuẩn code Python cho AI20K project"
weight: 1
---

## Python Style Guide

### 1. Type Hints — BẮT BUỘC

```python
# ✅ TỐT — Full type hints
async def analyze_sentiment(text: str) -> dict[str, float]:
    """Phân tích sentiment của text."""
    result = await model.predict(text)
    return {"positive": result.pos, "negative": result.neg}

# ❌ TỆ — Không type hints
def process(data):
    x = model.run(data)
    return x
```

### 2. Function Rules

- **Max 30 lines** per function — dài hơn → tách ra
- **Max 3 parameters** — nhiều hơn → dùng Pydantic model
- **Luôn có return type hint**
- **Docstring** cho public functions

### 3. Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| File | snake_case | `analyze_node.py` |
| Function | snake_case | `def analyze_query()` |
| Class | PascalCase | `class AgentState` |
| Constant | UPPER_SNAKE | `MAX_RETRIES = 3` |

### 4. Import Order

```python
# 1. Standard library
import os
from typing import Optional

# 2. Third-party
from fastapi import APIRouter, HTTPException
from langchain_core.tools import tool

# 3. Local
from src.config import get_settings
from src.models.schemas import ChatRequest
```

### 5. Error Handling

```python
# ✅ TỐT — Specific exception
try:
    result = await llm.ainvoke(prompt)
except openai.APIError as e:
    logger.error(f"LLM call failed: {e}")
    return {"error": str(e)}

# ❌ TỆ — Bare except (trừ khi có lý do đặc biệt)
try:
    result = await llm.ainvoke(prompt)
except:  # Che mọi lỗi!
    pass
```

### 6. Lint with Ruff

```bash
# Check
ruff check src/ tests/

# Auto-fix
ruff check --fix src/ tests/
```

Ruff chạy tự động trong CI — code không pass ruff sẽ bị reject.
