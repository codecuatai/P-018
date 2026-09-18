---
title: "Agent Tools"
description: "Tạo tools cho LangGraph agent"
weight: 3
---

## Tool Definition

```python
from langchain_core.tools import tool

@tool
def search_knowledge(query: str) -> str:
    """Tìm kiếm thông tin trong knowledge base.

    Args:
        query: Câu hỏi cần tìm kiếm

    Returns:
        Kết quả tìm kiếm dạng text
    """
    results = vector_store.similarity_search(query, k=3)
    return "\n".join([r.page_content for r in results])
```

## Nguyên tắc

1. **Luôn có docstring** — Agent dùng docstring để quyết định khi nào gọi tool
2. **Type hints cho tất cả params** — Giúp agent truyền đúng kiểu data
3. **Return string** — Agent dễ parse kết quả
4. **Error handling bên trong tool** — Không throw, return error message

## Tool Types

### Search Tool (RAG)

```python
@tool
def search_documents(query: str) -> str:
    """Tìm kiếm tài liệu liên quan."""
    docs = vector_store.similarity_search(query, k=5)
    if not docs:
        return "Không tìm thấy tài liệu liên quan."
    return "\n---\n".join([d.page_content for d in docs])
```

### API Call Tool

```python
@tool
def call_external_api(endpoint: str, params: dict) -> str:
    """Gọi API ngoài."""
    try:
        response = httpx.post(endpoint, json=params)
        return response.text
    except Exception as e:
        return f"API error: {e}"
```

### Calculator Tool

```python
@tool
def calculate(expression: str) -> str:
    """Tính toán biểu thức toán học."""
    try:
        result = eval(expression, {"__builtins__": {}}, {})
        return str(result)
    except Exception as e:
        return f"Calculation error: {e}"
```

## Thêm Tools vào Agent

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o-mini")
llm_with_tools = llm.bind_tools([search_documents, calculate])
```
