# Legacy/reference: AI Concierge project documents

> These documents are retained as historical planning and course material. They are **not** the X-One architecture source of truth and describe an earlier FastAPI-monolith design whose Redis, WebSocket, and multi-provider capabilities were never approved for the current backend-first foundation. Consult [current state](../architecture/current-state.md), the [ADRs](../adr/README.md), and the API/architecture documentation for current decisions and implementation status.
>
> **What was actually built instead** — read this before trusting any table below:
>
> | Planned here | Shipped in this repository |
> | --- | --- |
> | FastAPI monolith backend | NestJS API Gateway (`apps/api-gateway`, port 3000) as the only public edge, plus four FastAPI domain services |
> | Redis cache, session store, Pub/Sub | None. No Redis anywhere; root `AGENTS.md` forbids adding queues/Redis |
> | WebSocket / SSE realtime timeline | None. Synchronous REST/JSON only — see [ADR 0003](../adr/0003-synchronous-rest.md) |
> | GPT-4o / Claude 3.5 orchestration | Gemini (`GEMINI_MODEL`) primary with deterministic fallback, in `apps/agent-service` |
> | pgvector semantic memory | None |
> | Agent calls tools directly | Agent emits typed tool requests only; the Gateway executes every side effect — see [ADR 0004](../adr/0004-one-agent-tool-gateway.md) |
> | 5 domains incl. Payment/Memory tools | 4 domains: Ride, Restaurant, Healthcare, Food. Payment is a Gateway-owned sandbox; there is no Memory domain |

# AI Concierge - Intelligent Multi-Service Ride & Service Booking Agent

> **X-ONE ASSISTANT | PRODUCT REQUIREMENTS DOCUMENT & PROJECT DOCUMENTATION**\
> **Phiên bản:** 1.0 | **Quy mô nhóm:** 4 thành viên | **Thời gian phát triển:** 6 tuần\
> **Mức độ:** Tham vọng cao, triển khai theo Vertical Slice

---

## 1. Overview (Tổng Quan)

**AI Concierge (X-One Assistant)** là nền tảng AI Agent hoạt động trực tiếp trong giao diện hội thoại (Conversational Interface), cho phép người dùng tìm kiếm, đặt lịch, thanh toán và quản lý nhiều loại dịch vụ (Multi-Service) mà không cần chuyển đổi giữa nhiều ứng dụng độc lập.

**Định vị sản phẩm:** Không phải là chatbot hỏi đáp thông thường (Q&A Chatbot), mà là một **hệ thống thực thi tác vụ (Task Execution System)** có workflow đa bước, quản lý state, memory có sự đồng ý (consent), tích hợp human-in-the-loop và đảm bảo an toàn giao dịch (transaction safety).

---

## 2. Core Features (Tính Năng Cốt Lõi)

- **Chat & NLU Tự Nhiên:** Hiểu các câu thoại tiếng Việt phức tạp, xử lý câu thiếu thông tin hoặc sai chính tả phổ biến.
- **Slot Filling Động:** Trích xuất tự động các slot thông tin (điểm đi, điểm đến, ngày giờ, ngân sách, số người,...), chỉ hỏi lại các thông tin còn thiếu và cho phép chỉnh sửa từng slot.
- **Multi-Service Planning & Coordination:** Lập kế hoạch nhiều bước (multi-step dependency), phối hợp đặt lịch khám bệnh và đặt xe tự động để đưa người dùng đến trước giờ hẹn.
- **Human-in-the-Loop & Confirmation Safeguard:** Bắt buộc có bước xác nhận rõ ràng với Confirmation Token (gắn hash payload, TTL 5 phút) trước các hành động quan trọng (booking, thanh toán, hủy có phí).
- **Realtime Status & Event Timeline:** Theo dõi tiến trình tài xế / giao dịch theo thời gian thực qua WebSocket và Redis Pub/Sub, hỗ trợ tự động kết nối lại (reconnect).
- **User Memory & Consent Engine:** Ghi nhớ địa chỉ quen (nhà riêng, trường học, công ty) và sở thích cá nhân khi có sự đồng ý của người dùng; hỗ trợ xem, sửa, xóa và tắt memory.
- **Sandbox Transaction Safety:** Tích hợp thanh toán giả lập (sandbox payment), kiểm tra chống trùng đơn bằng idempotency key, hỗ trợ xử lý sự cố (partial failure) và chuyển giao cho tổng đài viên (human handoff).
- **Explainability & Transparency:** Minh bạch quyết định của AI, hiển thị chi phí dự kiến, thời gian di chuyển và lịch trình chi tiết.

---

## 3. Technology Stack (Công Nghệ Sử Dụng)

| Phân hệ | Công nghệ lựa chọn | Ghi chú & Trách nhiệm |
| :--- | :--- | :--- |
| **Frontend UI** | React / Next.js, TailwindCSS | Web application responsive, Rich Cards, Streaming response, WebSocket |
| **Backend API** | FastAPI (Python) | REST API, SSE / WebSocket, Auth (JWT + RBAC), Business Logic, Policy Guardrail |
| **AI Orchestration**| LangGraph + GPT-4o / Claude 3.5 | Graph state machine, Intent classification, Slot filling, Tool calling |
| **Database** | PostgreSQL | Dữ liệu giao dịch có cấu trúc, Users, Orders, Audit logs, Immutable timeline |
| **Cache & Realtime** | Redis | Session management, State checkpoint, Cache, Pub/Sub event broadcasting |
| **Vector DB** | pgvector (Optional) | Sử dụng khi nâng cấp truy hồi memory ngữ nghĩa sâu (semantic search) |
| **Container & Cloud**| Docker Compose, Railway / Render / VPS | Đóng gói container hóa, CI/CD pipeline, triển khai môi trường staging/prod |

---

## 4. Documentation Structure (Cấu Trúc Thư Mục Tài Liệu)

Thư mục `docs/AI_Concierge_Project_Docs/` hiện có **8 tệp** kế hoạch (bản kế hoạch gốc dự tính 9 — xem ghi chú cuối mục):

1. [01_Project_Charter.md](01_Project_Charter.md): Tầm nhìn dự án, mục tiêu, nguyên tắc thiết kế, phạm vi (In-Scope / Out-of-Scope) và phân chia vai trò thành viên.
2. [02_PRD.md](02_PRD.md): Yêu cầu sản phẩm chi tiết, User Personas, 8 User Stories & Acceptance Criteria, 15 Yêu cầu chức năng (FR), Yêu cầu phi chức năng (NFR) và chính sách an toàn.
3. [03_System_Architecture.md](03_System_Architecture.md): Kiến trúc hệ thống, LangGraph State Schema (22 biến), sơ đồ luồng 22 Graph Nodes, giới hạn hoạt động của Agent, phân định trách nhiệm LLM vs Backend và sơ đồ cơ sở dữ liệu.
4. [04_Backlog.md](04_Backlog.md): Danh sách 6 Epics phát triển sản phẩm với các công việc chi tiết.
5. [05_Timeline.md](05_Timeline.md): Lộ trình triển khai 6 tuần (Sprints), danh sách Milestone từng tuần và các quy tắc quản lý tiến độ.
6. [06_API_Design.md](06_API_Design.md): Danh sách Tool Specifications đầy đủ cho 5 domain (Ride, Medical, Restaurant, Payment, Memory), chuẩn Pydantic schema, công thức hash idempotency và định dạng Confirmation Token.
7. [07_Evaluation.md](07_Evaluation.md): Bộ test suite 150 kịch bản kiểm thử, các chỉ số đánh giá định lượng (Success Metrics), danh sách test bắt buộc và kịch bản Demo chính.
8. [08_Service_API_Integration_Guide.md](08_Service_API_Integration_Guide.md): Mô tả từng nhóm dịch vụ như food marketplace, POS/order và delivery/logistics; cách hoạt động, interface adapter, luồng tích hợp và khuyến nghị provider cho dev/release.

> **Ghi chú:** bản kế hoạch gốc còn dự tính một tệp `08_External_Provider_Strategy.md` (chiến lược dùng API/sandbox bên thứ ba: Uber Guest Rides Sandbox, Zocdoc, Microsoft Bookings, OpenTable/Yelp, DoorDash Drive) và đánh số tệp integration guide là `09_`. Tệp chiến lược provider **chưa từng được viết**, và integration guide mang số `08_`. X-One hiện không tích hợp provider bên thứ ba nào — Ride là simulation, Payment là sandbox nội bộ của Gateway.

---

## 5. Core Execution Motto (Tiêu Chuẩn Thành Công)

> *"Người dùng gửi một yêu cầu tự nhiên $\rightarrow$ Agent hiểu đúng $\rightarrow$ Hỏi đủ thông tin còn thiếu $\rightarrow$ Gọi đúng Tool $\rightarrow$ Xác nhận đúng lúc $\rightarrow$ Tạo đúng một giao dịch an toàn $\rightarrow$ Theo dõi trạng thái realtime và xử lý thất bại linh hoạt mà không bịa dữ liệu."*
