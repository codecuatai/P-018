---
title: "RAG Pattern"
description: "Retrieval-Augmented Generation pattern"
weight: 1
---

## RAG (Retrieval-Augmented Generation)

### Flow

```
Query → Embed → Search Vector DB → Retrieve Top-K → Context + Query → LLM → Response
```

### Implementation

```python
# Node: Retrieve context từ vector store
async def retrieve_node(state: AgentState) -> dict:
    query = state.get("query", "")

    # Embed query
    embeddings = OpenAIEmbeddings()
    query_embedding = await embeddings.aembed_query(query)

    # Search vector store
    docs = vector_store.similarity_search_by_vector(query_embedding, k=3)
    context = "\n---\n".join([d.page_content for d in docs])

    return {"context": context}
```

### Graph với RAG

```python
def build_rag_graph():
    graph = StateGraph(AgentState)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("generate", generate_node)
    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "generate")
    graph.add_edge("generate", END)
    return graph.compile()
```

## Streaming Response

```python
from fastapi.responses import StreamingResponse

@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    async def generate():
        async for chunk in agent.astream({"query": request.message}):
            yield f"data: {json.dumps(chunk)}\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream")
```

## Pydantic Settings Pattern

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    api_key: str = ""  # Required in .env
    model: str = "gpt-4o-mini"  # Default

    model_config = {"env_file": ".env"}
```

## FastAPI Lifespan Pattern

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("Starting app...")
    yield
    # Shutdown
    print("Shutting down...")

app = FastAPI(lifespan=lifespan)
```
