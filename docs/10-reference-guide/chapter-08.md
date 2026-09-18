---
title: "Kiểm thử và Đánh giá"
weight: 8
---

## 8.1 Tại sao cần test

Trong các kỳ đánh giá AI20K, **phần lớn đội không có bất kỳ test tự động nào** — đây là lỗi nghiêm trọng nhất ảnh hưởng đến điểm Code Quality và Evaluation Evidence. Không có test, bạn không thể chứng minh code hoạt động đúng, không thể refactor an toàn, và không thể detect regression (lỗi quay lại). BTC đánh giá thấp những dự án thiếu test vì nó thể hiện thiếu kỷ luật engineering.

Testing không chỉ là "viết thêm code để kiểm tra code." Testing là **safety net** (lưới an toàn) cho phép bạn thay đổi code mà không sợ làm hỏng tính năng cũ. Khi bạn thêm node mới vào LangGraph graph, test đảm bảo các node cũ vẫn hoạt động. Khi bạn refactor prompt, test đảm bảo output vẫn đúng format.

**Kim tự tháp kiểm thử (Testing Pyramid)** là mô hình phân bổ effort testing:

- **Unit tests** (nhiều nhất): test từng function, từng node riêng lẻ. Nhanh, ổn định, dễ viết. Chiếm 70-80% tổng số test.
- **Integration tests** (trung bình): test sự tương tác giữa các components — API endpoint gọi đến database, LangGraph graph chạy end-to-end với mock LLM. Chiếm 15-20%.
- **Evaluation tests** (ít nhất): test chất lượng output của AI — accuracy, faithfulness, relevance. Chạy chậm, cần LLM thật. Chiếm 5-10%.

Ví dụ thực tế: một endpoint `/api/v1/chat` nhận message và trả về response.

- **Unit test:** test hàm `parse_message()` trả đúng format.
- **Integration test:** test toàn bộ endpoint từ HTTP request đến response, với LLM bị mock.
- **Evaluation test:** gửi 50 câu hỏi thực tế, kiểm tra accuracy và faithfulness của response.

```python
# Ví dụ minh họa 3 loại test
import pytest
from unittest.mock import AsyncMock, patch

# --- Unit Test: test một hàm đơn lẻ ---
def test_parse_message_valid_input():
    """Unit test: test hàm parse_message với input hợp lệ."""
    from app.utils import parse_message

    result = parse_message('{"message": "Xin chào", "thread_id": "123"}')
    assert result["message"] == "Xin chào"
    assert result["thread_id"] == "123"


# --- Integration Test: test API endpoint ---
@pytest.mark.asyncio
async def test_chat_endpoint(client):
    """Integration test: test endpoint /api/v1/chat."""
    response = await client.post(
        "/api/v1/chat",
        json={"message": "Xin chào", "thread_id": "test-123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "response" in data


# --- Evaluation Test: test chất lượng AI ---
def test_rag_accuracy(eval_dataset):
    """Evaluation test: test accuracy trên dataset."""
    correct = 0
    for sample in eval_dataset:
        response = agent.run(sample["question"])
        if response["answer"] == sample["expected_answer"]:
            correct += 1
    accuracy = correct / len(eval_dataset)
    assert accuracy >= 0.7, f"Accuracy {accuracy} below threshold 0.7"
```

> 🔑 **ĐIỂM CHÍNH:** Không cần 100% coverage ngay từ đầu. Hãy bắt đầu với 5-10 test cho các phần quan trọng nhất (API endpoints, graph routing, data validation), rồi tăng dần. Mục tiêu tối thiểu cho AI20K là 60% code coverage.

## 8.2 Viết test cho API

Test API endpoint là loại test mang lại giá trị cao nhất với effort thấp nhất. Bạn test toàn bộ flow: HTTP request → FastAPI routing → validation → business logic → response. Nếu API test pass, bạn có độ tin cậy cao rằng ứng dụng hoạt động đúng từ góc độ người dùng.

### Cài đặt pytest và dependencies

```bash
pip install pytest pytest-asyncio pytest-cov httpx
```

Giải thích từng package:
- **pytest**: framework test phổ biến nhất cho Python, với syntax đơn giản và plugin ecosystem phong phú
- **pytest-asyncio**: cho phép test các hàm async (FastAPI là async framework)
- **pytest-cov**: đo code coverage
- **httpx**: HTTP client hỗ trợ async, dùng để test FastAPI app thông qua `AsyncClient`

### conftest.py — Fixtures dùng chung

File `conftest.py` chứa pytest fixtures — các hàm setup/teardown được tái sử dụng across tất cả test files. Đặt ở thư mục `tests/`.

```python
# tests/conftest.py
import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture(scope="session")
def event_loop():
    """Tạo event loop dùng chung cho tất cả test trong session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def client():
    """
    Tạo AsyncClient test cho FastAPI app.
    Sử dụng ASGITransport để gọi trực tiếp ASGI app
    mà không cần chạy server thật.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as ac:
        yield ac


@pytest.fixture
def sample_chat_request():
    """Dữ liệu mẫu cho chat request."""
    return {
        "message": "Việt Nam có bao nhiêu tỉnh thành?",
        "thread_id": "test-thread-001",
    }


@pytest.fixture
def sample_documents():
    """Dữ liệu mẫu cho document upload."""
    return {
        "documents": [
            {
                "title": "Giới thiệu Việt Nam",
                "content": "Việt Nam có 63 tỉnh thành phố.",
                "source": "wiki",
            }
        ]
    }
```

**Giải thích:** Fixture `client` tạo `AsyncClient` kết nối trực tiếp đến FastAPI app qua ASGI transport — không cần chạy HTTP server thật. Điều này làm test nhanh hơn 10-100 lần so với test qua network thật. `scope="session"` cho `event_loop` tạo loop một lần và tái sử dụng cho tất cả test.

### Test GET endpoints

```python
# tests/test_api_health.py
import pytest


@pytest.mark.asyncio
async def test_health_check(client):
    """Test GET /health trả về status healthy."""
    response = await client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "timestamp" in data
    assert "version" in data


@pytest.mark.asyncio
async def test_health_check_has_database(client):
    """Test GET /health bao gồm database status."""
    response = await client.get("/health")

    data = response.json()
    assert "database" in data
    assert data["database"] in ["connected", "disconnected"]


@pytest.mark.asyncio
async def test_root_endpoint(client):
    """Test GET / trả về thông tin API."""
    response = await client.get("/")

    assert response.status_code == 200
    data = response.json()
    assert "message" in data or "status" in data
```

### Test POST endpoints với mock LLM

```python
# tests/test_api_chat.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_chat_success(client, sample_chat_request):
    """Test POST /api/v1/chat với mock LLM response."""
    # Mock agent.arun để không gọi LLM thật
    mock_response = "Việt Nam có 63 tỉnh thành phố trực thuộc trung ương."

    with patch("app.agent.graph.agent") as mock_agent:
        mock_agent.arun = AsyncMock(return_value=mock_response)

        response = await client.post(
            "/api/v1/chat",
            json=sample_chat_request,
        )

    assert response.status_code == 200
    data = response.json()
    assert "response" in data
    assert "63" in data["response"]


@pytest.mark.asyncio
async def test_chat_empty_message(client):
    """Test POST /api/v1/chat với message rỗng → validation error."""
    response = await client.post(
        "/api/v1/chat",
        json={"message": "", "thread_id": "test-001"},
    )

    assert response.status_code == 422  # Validation Error


@pytest.mark.asyncio
async def test_chat_missing_thread_id(client):
    """Test POST /api/v1/chat thiếu thread_id."""
    response = await client.post(
        "/api/v1/chat",
        json={"message": "Xin chào"},
    )

    # Tùy thuộc vào thread_id có required hay auto-generate
    assert response.status_code in [200, 422]


@pytest.mark.asyncio
async def test_chat_long_message(client):
    """Test POST /api/v1/chat với message quá dài."""
    long_message = "A" * 10001  # Vượt quá giới hạn

    response = await client.post(
        "/api/v1/chat",
        json={"message": long_message, "thread_id": "test-001"},
    )

    assert response.status_code == 422  # Validation Error


@pytest.mark.asyncio
async def test_chat_llm_error(client, sample_chat_request):
    """Test POST /api/v1/chat khi LLM bị lỗi."""
    with patch("app.agent.graph.agent") as mock_agent:
        mock_agent.arun = AsyncMock(
            side_effect=Exception("LLM API timeout")
        )

        response = await client.post(
            "/api/v1/chat",
            json=sample_chat_request,
        )

    # API nên handle lỗi gracefully
    assert response.status_code == 500
    data = response.json()
    assert "error" in data or "detail" in data
```

**Giải thích mock:** `unittest.mock.patch` thay thế `agent` bằng mock object. `AsyncMock(return_value=...)` trả về giá trị giả định thay vì gọi LLM thật — tiết kiệm tiền API và đảm bảo test ổn định (không phụ thuộc vào LLM response thay đổi). `side_effect=Exception(...)` mock tình huống LLM lỗi.

> 💡 **MẸO:** Luôn mock external dependencies (LLM, database, third-party APIs) trong unit/integration tests. Test thật chỉ dành cho evaluation tests. Mock đảm bảo test nhanh, ổn định, miễn phí.

Chạy tests:

```bash
# Chạy tất cả tests
pytest tests/ -v

# Chạy một file test
pytest tests/test_api_chat.py -v

# Chạy một test cụ thể
pytest tests/test_api_chat.py::test_chat_success -v

# Chạy với coverage
pytest tests/ -v --cov=app --cov-report=term-missing

# Chạy và in print statements
pytest tests/ -v -s
```

## 8.3 Viết test cho Agent

Test Agent (LangGraph) phức tạp hơn test API vì agent có state, conditional routing, và gọi LLM. Chiến lược là test từng node riêng lẻ (unit test), rồi test toàn bộ graph flow (integration test), luôn mock LLM response.

### Test individual nodes

Mỗi node trong LangGraph graph là một function nhận state và trả về state mới. Test node là test function thuần túy — đơn giản và nhanh chóng.

```python
# tests/test_agent_nodes.py
import pytest
from unittest.mock import AsyncMock, patch


def test_parse_user_query():
    """Unit test: test node parse_user_query."""
    from app.agent.nodes import parse_user_query

    state = {"messages": [{"role": "user", "content": "Giá vàng hôm nay?"}]}
    result = parse_user_query(state)

    assert "parsed_query" in result
    assert result["parsed_query"]["intent"] == "price_query"
    assert "vàng" in result["parsed_query"]["entity"]


def test_format_response():
    """Unit test: test node format_response."""
    from app.agent.nodes import format_response

    state = {
        "raw_answer": "Giá vàng 18K hôm nay là 5.2 triệu/lượng.",
        "sources": [{"title": "Giá vàng", "url": "https://example.com"}],
    }
    result = format_response(state)

    assert "response" in result
    assert "5.2" in result["response"]
    assert "Nguồn" in result["response"] or "source" in result["response"].lower()


@pytest.mark.asyncio
async def test_retrieve_documents():
    """Unit test: test node retrieve_documents với mock vector store."""
    from app.agent.nodes import retrieve_documents

    mock_docs = [
        {"content": "Giá vàng SJC 5.2 triệu", "score": 0.95},
        {"content": "Giá vàng 18K 4.8 triệu", "score": 0.88},
    ]

    with patch("app.agent.nodes.vector_store") as mock_vs:
        mock_vs.similarity_search = AsyncMock(return_value=mock_docs)

        state = {"parsed_query": {"entity": "vàng", "intent": "price_query"}}
        result = await retrieve_documents(state)

    assert "documents" in result
    assert len(result["documents"]) == 2
```

### Test graph flow end-to-end

Test toàn bộ graph từ input đến output, với tất cả LLM calls bị mock. Điều này đảm bảo routing logic đúng — agent đi qua đúng các nodes theo đúng thứ tự.

```python
# tests/test_agent_graph.py
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.mark.asyncio
async def test_graph_simple_query_flow():
    """Integration test: test graph flow cho câu hỏi đơn giản."""
    from app.agent.graph import build_graph

    graph = build_graph()

    # Mock tất cả LLM calls
    with patch("app.agent.nodes.llm") as mock_llm:
        mock_llm.ainvoke = AsyncMock(
            return_value=MagicMock(
                content='{"intent": "simple_query", "entity": "vàng"}'
            )
        )

        # Mock retrieve
        with patch("app.agent.nodes.vector_store") as mock_vs:
            mock_vs.similarity_search = AsyncMock(
                return_value=[{"content": "Gold price data", "score": 0.9}]
            )

            # Chạy graph
            result = await graph.ainvoke(
                {"messages": [{"role": "user", "content": "Giá vàng?"}]}
            )

    assert "response" in result
    assert len(result.get("messages", [])) > 1


@pytest.mark.asyncio
async def test_graph_conditional_routing():
    """Test: graph route đúng cho các loại query khác nhau."""
    from app.agent.graph import build_graph, should_retrieve

    # Query cần retrieval
    state_retrieve = {"parsed_query": {"intent": "price_query"}}
    assert should_retrieve(state_retrieve) == "retrieve"

    # Query không cần retrieval (chitchat)
    state_chitchat = {"parsed_query": {"intent": "chitchat"}}
    assert should_retrieve(state_chitchat) == "respond_directly"


@pytest.mark.asyncio
async def test_graph_handles_empty_input():
    """Test: graph xử lý input rỗng gracefully."""
    from app.agent.graph import build_graph

    graph = build_graph()

    result = await graph.ainvoke(
        {"messages": [{"role": "user", "content": ""}]}
    )

    # Graph nên trả về response thay vì crash
    assert result is not None
    assert "response" in result or "messages" in result


@pytest.mark.asyncio
async def test_graph_preserves_thread_history():
    """Test: graph duy trì lịch sử hội thoại."""
    from app.agent.graph import build_graph

    graph = build_graph()
    thread_id = "test-thread-history"

    # Message 1
    with patch("app.agent.nodes.llm") as mock_llm:
        mock_llm.ainvoke = AsyncMock(
            return_value=MagicMock(content="Việt Nam ở Đông Nam Á.")
        )

        result1 = await graph.ainvoke(
            {
                "messages": [
                    {"role": "user", "content": "Việt Nam ở đâu?"}
                ],
                "thread_id": thread_id,
            }
        )

    # Message 2 — nên nhớ context từ message 1
    with patch("app.agent.nodes.llm") as mock_llm:
        mock_llm.ainvoke = AsyncMock(
            return_value=MagicMock(
                content="Thủ đô của Việt Nam là Hà Nội."
            )
        )

        result2 = await graph.ainvoke(
            {
                "messages": [
                    {"role": "user", "content": "Thủ đô của nó là gì?"},
                ],
                "thread_id": thread_id,
            }
        )

    assert result2 is not None
```

> 🔑 **ĐIỂM CHÍNH:** Khi test LangGraph, test theo 3 mức: (1) từng node riêng lẻ (unit), (2) conditional routing logic (unit), (3) toàn bộ graph flow end-to-end (integration). Mock tất cả LLM calls để test nhanh và ổn định.

### Test conditional routing riêng biệt

Conditional routing là logic quan trọng nhất trong LangGraph — nó quyết định agent đi qua path nào. Test riêng routing function đảm bảo agent hành xử đúng với mỗi loại input.

```python
# tests/test_routing.py
import pytest
from app.agent.routing import should_retrieve, classify_intent


class TestShouldRetrieve:
    """Test routing function should_retrieve."""

    @pytest.mark.parametrize(
        "intent,expected",
        [
            ("price_query", "retrieve"),
            ("faq", "retrieve"),
            ("chitchat", "respond_directly"),
            ("greeting", "respond_directly"),
            ("complaint", "retrieve"),
        ],
    )
    def test_routing_by_intent(self, intent, expected):
        """Test: mỗi intent route đúng path."""
        state = {"parsed_query": {"intent": intent}}
        result = should_retrieve(state)
        assert result == expected


class TestClassifyIntent:
    """Test intent classification."""

    def test_price_query(self):
        result = classify_intent("Giá vàng hôm nay bao nhiêu?")
        assert result == "price_query"

    def test_greeting(self):
        result = classify_intent("Xin chào")
        assert result == "greeting"

    def test_faq(self):
        result = classify_intent("Làm sao để mở tài khoản?")
        assert result == "faq"
```

**Giải thích `@pytest.mark.parametrize`:** Decorator này chạy test nhiều lần với các input khác nhau — mỗi bộ (intent, expected) là một test case riêng. 5 bộ data = 5 test cases, viết trong 1 function. Rất hữu ích cho test routing logic có nhiều trường hợp.

## 8.4 Test Coverage

Code coverage đo tỷ lệ phần trăm code được thực thi khi chạy tests. 100% coverage nghĩa là mọi dòng code đều được ít nhất 1 test chạy qua. Tuy nhiên, 100% coverage không đảm bảo 100% correctness — test có thể chạy qua code nhưng không assert đúng. Coverage là chỉ số tham khảo, không phải mục tiêu tuyệt đối.

### Cài đặt và chạy coverage

```bash
# Cài pytest-cov
pip install pytest-cov

# Chạy tests với coverage report
pytest tests/ --cov=app --cov-report=term-missing

# Tạo HTML report (mở htmlcov/index.html trong browser)
pytest tests/ --cov=app --cov-report=html

# Đặt minimum coverage threshold
pytest tests/ --cov=app --cov-fail-under=60
```

Output terminal sẽ hiển thị bảng coverage:

```
Name                           Stmts   Miss  Cover   Missing
-------------------------------------------------------------
app/__init__.py                    0      0   100%
app/main.py                       25      3    88%   45-47
app/api/__init__.py                0      0   100%
app/api/health.py                  8      0   100%
app/api/chat.py                   35     12    66%   23-28, 41-46
app/agent/__init__.py              0      0   100%
app/agent/graph.py                45     18    60%   34-52, 67-71
app/agent/nodes.py                30      5    83%   15, 28-30
app/agent/routing.py              12      0   100%
-------------------------------------------------------------
TOTAL                            155     38    75%
```

Cột "Missing" cho biết dòng nào chưa được test覆盖 — tập trung viết test cho những dòng này.

### Mục tiêu coverage cho AI20K

| Phần code | Mục tiêu coverage | Ghi chú |
|-----------|-------------------|---------|
| API endpoints | 80%+ | Quan trọng nhất, dễ test |
| Agent nodes | 70%+ | Mock LLM, test logic |
| Routing logic | 90%+ | Đơn giản, parametrize test |
| Graph flow | 60%+ | Integration test |
| Utilities | 80%+ | Pure functions, dễ test |
| Configuration | 50%+ | Ít logic, ít priority |
| **Tổng thể** | **60%+** | **Mục tiêu tối thiểu** |

### Cấu hình coverage trong `pyproject.toml`

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
addopts = "-v --cov=app --cov-report=term-missing --cov-fail-under=60"

[tool.coverage.run]
source = ["app"]
omit = [
    "app/__init__.py",
    "*/tests/*",
    "*/migrations/*",
]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "if __name__ == .__main__.:",
    "raise NotImplementedError",
    "pass",
]
```

Với cấu hình này, chỉ cần chạy `pytest` không cần thêm flag nào — nó tự động chạy coverage và fail nếu dưới 60%.

> ⚠️ **LƯU Ý:** Không cố gắng đạt 100% coverage bằng cách viết test "rác" — test chỉ gọi code mà không assert gì. Coverage cao + test chất lượng thấp tệ hơn coverage thấp + test chất lượng cao. Tập trung vào happy path, error path, và edge cases.

### Những gì nên test và bỏ qua

**Nên test:**
- API endpoints (happy path + error cases)
- Agent node logic (parsing, formatting, routing)
- Data validation (Pydantic models)
- Error handling (LLM timeout, invalid input, database error)

**Có thể bỏ qua:**
- LLM response content (không thể predict chính xác)
- Third-party library internals
- Trivial getters/setters
- Migration scripts

## 8.5 Evaluation Evidence — Bằng chứng đánh giá

Evaluation Evidence (bằng chứng đánh giá) là một trong 10 deliverables BTC yêu cầu, nhưng **rất ít đội** nộp được deliverable này. Đây là cơ hội ghi điểm lớn — đa số đội bỏ qua phần này, nên bạn chỉ cần nộp là đã vượt xa các đội khác.

### BTC mong đợi gì trong Evaluation Evidence?

BTC muốn thấy **bằng chứng có hệ thống** rằng agent của bạn hoạt động đúng và hữu ích. Không chỉ là "nó chạy được" mà là "nó chạy được và đây là bằng chứng." Evaluation Evidence cần bao gồm:

1. **Bảng metrics:** Accuracy, relevance, faithfulness, response time
2. **Test results:** Output từ pytest với coverage
3. **User feedback:** Kết quả thử nghiệm với người dùng thực
4. **Code traceability:** Map test case → requirement → code

### Cấu trúc báo cáo Evaluation Evidence

```markdown
# Evaluation Evidence — Team XXX

## 1. Test Results
- Số lượng test cases: 45
- Pass/Fail: 43/2
- Code coverage: 72%
- Screenshot: [pytest output]

## 2. RAG Quality Metrics
| Metric | Score | Benchmark |
|--------|-------|-----------|
| Faithfulness | 0.85 | > 0.7 |
| Answer Relevance | 0.82 | > 0.7 |
| Context Precision | 0.78 | > 0.6 |
| Context Recall | 0.80 | > 0.6 |

## 3. Performance Metrics
| Endpoint | Avg Response Time | P95 | P99 |
|----------|------------------|-----|-----|
| /api/v1/chat | 2.3s | 4.1s | 5.8s |
| /health | 12ms | 25ms | 40ms |

## 4. User Feedback
- Số người tham gia test: 10
- Rating trung bình: 4.2/5
- Phản hồi chính: [summary]
```

### Format bảng metrics

```python
# Script tạo metrics report
def generate_eval_report(test_results: list[dict]) -> dict:
    """Tạo evaluation report từ test results."""
    total = len(test_results)
    correct = sum(1 for r in test_results if r["passed"])

    return {
        "total_cases": total,
        "passed": correct,
        "failed": total - correct,
        "accuracy": correct / total if total > 0 else 0,
        "categories": _group_by_category(test_results),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
```

> 💡 **MẸO:** Chụp screenshot terminal output khi chạy pytest và đưa vào báo cáo. BTC thích thấy bằng chứng trực quan hơn là chỉ con số. Thêm coverage badge vào README — nó thể hiện chuyên nghiệp và dễ nhìn.

## 8.6 RAGAS — Đánh giá chất lượng RAG

RAGAS (Retrieval Augmented Generation Assessment) là framework đánh giá chất lượng hệ thống RAG. Nếu agent của bạn có retrieval (tìm kiếm tài liệu) + generation (sinh câu trả lời), RAGAS cung cấp metrics chính xác để đo chất lượng.

### Tại sao cần RAGAS?

Agent RAG có 2 giai đoạn: (1) retrieve documents liên quan, (2) generate câu trả lời dựa trên documents. Bạn cần đánh giá cả hai giai đoạn:

- **Retrieval có tìm đúng tài liệu không?** → Context Precision, Context Recall
- **Generation có trung thành với tài liệu không?** → Faithfulness
- **Câu trả lời có liên quan đến câu hỏi không?** → Answer Relevance

### 4 metrics chính của RAGAS

| Metric | Đo lường | Khoảng | Tốt |
|--------|----------|--------|-----|
| **Faithfulness** (Độ trung thành) | Câu trả lời có chỉ dựa vào context không? | 0-1 | > 0.7 |
| **Answer Relevance** | Câu trả lời có liên quan đến câu hỏi không? | 0-1 | > 0.7 |
| **Context Precision** | Documents retrieved có đúng thứ tự ưu tiên không? | 0-1 | > 0.6 |
| **Context Recall** | Có retrieve đủ documents cần thiết không? | 0-1 | > 0.6 |

### Cài đặt và chạy RAGAS

```bash
pip install ragas
```

```python
# tests/test_ragas_eval.py
"""
RAGAS evaluation test.
Chạy riêng: pytest tests/test_ragas_eval.py -v --timeout=300
"""
import pytest
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
)
from datasets import Dataset


# Test dataset — bạn cần tạo dataset thực tế cho dự án của mình
TEST_DATASET = {
    "question": [
        "Giá vàng SJC hôm nay bao nhiêu?",
        "Thủ tục mở tài khoản ngân hàng?",
        "Lãi suất tiết kiệm 6 tháng?",
    ],
    "contexts": [
        [
            "Giá vàng SJC mua vào 5.150.000đ, bán ra 5.200.000đ.",
            "Giá vàng nhẫn tròn 5.050.000đ - 5.100.000đ.",
        ],
        [
            "Bước 1: Mang CMND/CCCD đến quầy.",
            "Bước 2: Điền form đăng ký mở tài khoản.",
            "Bước 3: Nạp tiền tối thiểu 50.000đ.",
        ],
        [
            "Lãi suất tiết kiệm 6 tháng là 5.0%/năm.",
            "Lãi suất không kỳ hạn là 0.1%/năm.",
        ],
    ],
    "answer": [
        "Giá vàng SJC hôm nay: mua vào 5.150.000đ, bán ra 5.200.000đ.",
        "Để mở tài khoản, bạn cần mang CMND/CCCD đến quầy, điền form đăng ký, và nạp tối thiểu 50.000đ.",
        "Lãi suất tiết kiệm 6 tháng hiện tại là 5.0%/năm.",
    ],
    "ground_truth": [
        "Giá vàng SJC: mua 5.150.000đ, bán 5.200.000đ.",
        "CMND + form + nạp 50.000đ.",
        "5.0%/năm.",
    ],
}


@pytest.mark.asyncio
@pytest.mark.timeout(300)  # Timeout 5 phút
async def test_ragas_metrics():
    """Chạy RAGAS evaluation trên test dataset."""
    dataset = Dataset.from_dict(TEST_DATASET)

    metrics = [
        faithfulness,
        answer_relevancy,
        context_precision,
        context_recall,
    ]

    results = evaluate(dataset, metrics=metrics)

    # Assert minimum thresholds
    assert results["faithfulness"] >= 0.7, (
        f"Faithfulness {results['faithfulness']:.2f} < 0.7"
    )
    assert results["answer_relevancy"] >= 0.7, (
        f"Answer Relevancy {results['answer_relevancy']:.2f} < 0.7"
    )

    # Print results để đưa vào báo cáo
    print("\n=== RAGAS Evaluation Results ===")
    for metric, value in results.items():
        print(f"  {metric}: {value:.3f}")


def test_generate_eval_table():
    """
    Helper: in bảng metrics cho báo cáo Evaluation Evidence.
    Không phải test thật — dùng để generate report.
    """
    # Thay bằng results thực tế từ test_ragas_metrics
    mock_results = {
        "faithfulness": 0.85,
        "answer_relevancy": 0.82,
        "context_precision": 0.78,
        "context_recall": 0.80,
    }

    print("\n| Metric | Score | Benchmark |")
    print("|--------|-------|-----------|")
    for metric, value in mock_results.items():
        status = "PASS" if value >= 0.7 else "FAIL"
        print(f"| {metric} | {value:.2f} | > 0.7 ({status}) |")
```

> ⚠️ **LƯU Ý:** RAGAS evaluation gọi LLM (để đánh giá LLM output), nên nó tốn token và chạy chậm. Chạy riêng biệt, không chạy trong CI pipeline thông thường. Thêm flag `@pytest.mark.slow` và exclude khỏi default test run.

### Tạo test dataset chất lượng

Test dataset là yếu tố quyết định chất lượng RAGAS evaluation. Dưới đây là hướng dẫn tạo dataset:

```python
# scripts/create_eval_dataset.py
"""
Script tạo evaluation dataset từ dữ liệu thực.
Chạy: python scripts/create_eval_dataset.py
"""
import json


def create_eval_dataset():
    """Tạo eval dataset từ FAQ hoặc tài liệu."""
    dataset = {
        "question": [],
        "contexts": [],
        "answer": [],
        "ground_truth": [],
    }

    # Thêm các câu hỏi test — nên đa dạng:
    # - Câu hỏi trực tiếp (factual)
    # - Câu hỏi yêu cầu tổng hợp (multi-hop)
    # - Câu hỏi ngoài phạm vi (out-of-scope)
    # - Câu hỏi模糊 (ambiguous)

    test_cases = [
        {
            "question": "Giá vàng SJC hôm nay?",
            "contexts": ["Giá vàng SJC 5.150.000 - 5.200.000đ."],
            "ground_truth": "5.150.000 - 5.200.000đ",
            "category": "factual",
        },
        {
            "question": "So sánh lãi suất gửi tiết kiệm 3 tháng và 6 tháng?",
            "contexts": [
                "Lãi suất 3 tháng: 4.5%/năm.",
                "Lãi suất 6 tháng: 5.0%/năm.",
            ],
            "ground_truth": "3 tháng 4.5%, 6 tháng 5.0% — chênh 0.5%",
            "category": "multi_hop",
        },
        {
            "question": "Thời tiết hôm nay thế nào?",
            "contexts": [],
            "ground_truth": "Không có thông tin về thời tiết.",
            "category": "out_of_scope",
        },
    ]

    for tc in test_cases:
        dataset["question"].append(tc["question"])
        dataset["contexts"].append(tc["contexts"])
        dataset["ground_truth"].append(tc["ground_truth"])
        # Answer sẽ được generate bằng agent thật

    with open("eval_dataset.json", "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)

    print(f"Created dataset with {len(test_cases)} test cases")


if __name__ == "__main__":
    create_eval_dataset()
```

> 🔑 **ĐIỂM CHÍNH:** Evaluation Evidence là deliverable dễ ghi điểm nhất vì hầu hết đội bỏ qua. Chỉ cần: (1) pytest output với coverage, (2) bảng RAGAS metrics, (3) vài user feedback — bạn đã vượt xa phần lớn các đội khác.

## Tóm tắt

Trong chương này, chúng ta đã tìm hiểu về kiểm thử và đánh giá cho ứng dụng AI Agent:

- **Testing pyramid:** Unit tests (70-80%), Integration tests (15-20%), Evaluation tests (5-10%)
- **API testing:** pytest + AsyncClient + conftest.py fixtures, test GET/POST endpoints, validation, errors
- **Agent testing:** Test từng node riêng lẻ, test conditional routing, test graph flow end-to-end
- **Code coverage:** pytest-cov, mục tiêu 60%+, cấu hình trong pyproject.toml
- **Evaluation Evidence:** Cấu trúc báo cáo, metrics table, user feedback, code traceability
- **RAGAS metrics:** Faithfulness, Answer Relevancy, Context Precision, Context Recall

Phần lớn đội không có test. Phần lớn đội không có Evaluation Evidence. Chỉ cần bạn có cả hai, bạn đã ở top đội về Code Quality.

## Câu hỏi ôn tập

1. Tại sao phần lớn đội bỏ qua việc viết test? Hậu quả là gì cho điểm số?
2. Giải thích testing pyramid. Tại sao unit tests chiếm nhiều nhất?
3. `conftest.py` fixture `client` hoạt động như thế nào? Tại sao không cần chạy HTTP server thật?
4. Tại sao phải mock LLM responses trong integration tests?
5. `@pytest.mark.parametrize` giải quyết vấn đề gì? Cho ví dụ.
6. Code coverage 60% nghĩa là gì? Tại sao không cần 100%?
7. RAGAS Faithfulness đo lường điều gì? Tại sao quan trọng cho RAG agent?
8. Bạn cần những gì trong báo cáo Evaluation Evidence để BTC chấm điểm cao?
