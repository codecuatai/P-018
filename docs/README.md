# Hệ Thống Tài Liệu Kỹ Thuật X-One

Chào mừng bạn đến với kho tài liệu kỹ thuật chính thức của dự án **X-One**. Dưới đây là mục lục tổng hợp được phân loại theo từng phân hệ chức năng:

---

### 1. Kiến Trúc Cốt Lõi & Báo Cáo Thẩm Định
- [Hiện trạng kiến trúc thực tế](architecture/current-state.md) — Báo cáo trạng thái triển khai thực tế của từng dịch vụ, kèm bằng chứng kiểm thử trên codebase.
- [Hồ sơ kiến trúc Gate G2](architecture_diagram.md) — Sơ đồ kiến trúc MVP hiện tại và lộ trình tiến hóa Production, luồng dữ liệu, luồng điều khiển và checklist thẩm định.
- [Tổng quan hệ thống (System Overview)](architecture/system-overview.md) — Mô hình đa tầng: Client, Gateway, Agent, Domain Services và Database.
- [Cấu trúc mã nguồn (Repository Structure)](architecture/repository-structure.md) — Sơ đồ tổ chức monorepo, phân chia trách nhiệm thư mục.
- [Ranh giới dịch vụ (Service Boundaries)](architecture/service-boundaries.md) — Quy chuẩn phân định trách nhiệm nghiệp vụ và tính độc lập của từng service.
- [Kiến trúc Backend](architecture/backend-architecture.md) — Cơ chế điều phối trung tâm của NestJS Gateway và kiến trúc các dịch vụ FastAPI.
- [Kiến trúc AI Agent](architecture/agent-architecture.md) — LangGraph state machine, intent routing, slot extraction và cơ chế fallback tất định.
- [Quy trình nghiệp vụ (Workflows)](architecture/workflows.md) — Luồng tương tác chi tiết của 4 dịch vụ: Đặt xe, Đặt bàn, Đặt món và Khám bệnh.
- [Kiến trúc dữ liệu (Data Architecture)](architecture/data-architecture.md) — Thiết kế 6 cơ sở dữ liệu logic, chiến lược migration và seed dữ liệu.
- [Kiến trúc vận hành (Runtime Architecture)](architecture/runtime-architecture.md) — Vận hành Docker Compose, cổng dịch vụ, kiểm tra sức khỏe và hạn mức tài nguyên.
- [Kiến trúc an toàn & Bảo mật (Security Architecture)](architecture/security-architecture.md) — Xác thực JWT, xác nhận tài chính 2 bước, khóa chống trùng đơn và an toàn prompt.
- [Đặc tả Vertical Slice dịch vụ Đồ ăn (Food)](architecture/food-vertical-slice.md) — Phân tích mẫu một luồng dữ liệu hoàn chỉnh từ UI đến CSDL.

---

### 2. Thiết Kế Giao Diện & Trải Nghiệm Người Dùng (UI/UX)
- [Kiến trúc giao diện sản phẩm](product-ui-architecture.md) — Cấu trúc Next.js App Router, quản lý trạng thái, layout và xử lý lỗi.
- [Hệ thống thiết kế (Design System)](design-system.md) — Bảng màu, typography (Be Vietnam Pro), khoảng cách và quy chuẩn các thành phần UI.
- [Hệ thống chuyển động (Motion System)](motion-system.md) — Quy chuẩn animation, vi tương tác (micro-interactions) và hiệu ứng chuyển cảnh.
- [Bảng kiểm tra chất lượng giao diện (Visual QA Checklist)](visual-qa-checklist.md) — Checklist rà soát hiển thị trên các kích thước màn hình responsive.

---

### 3. Giao Diện Lập Trình Ứng Dụng (API) & Hợp Đồng Dịch Vụ
- [Quy ước thiết kế API (API Conventions)](api/api-conventions.md) — Tiêu chuẩn REST, cấu trúc phản hồi lỗi, idempotency header và phân trang.
- [Danh mục API thực tế (API Inventory)](api/api-inventory.md) — Danh sách toàn bộ các endpoint đang hoạt động của Gateway và Domain Services.
- [Hợp đồng gọi Tool (Tool Contracts)](api/tool-contracts.md) — Cấu trúc JSON Schema các công cụ mà Agent được phép yêu cầu Gateway thực thi.
- [Đặc tả Tool Registry v2](api/tool-registry-v2.md) — Cơ chế quản lý, đăng ký và phân quyền công cụ trong hệ thống.
- [Hợp đồng xác thực OpenAPI Gateway](../packages/contracts/openapi/gateway-auth-v1.yaml) — File đặc tả OpenAPI chuẩn cho phân hệ Authentication.

---

### 4. Hướng Dẫn Phát Triển & Vận Hành
- [Hướng dẫn phát triển Local](development/local-development.md) — Các bước cài đặt, chạy Docker hoặc chạy hybrid không cần container.
- [Danh mục biến môi trường](development/environment-variables.md) — Ý nghĩa, phạm vi và giá trị mặc định của toàn bộ 135 biến trong `.env.example`.
- [Cơ sở dữ liệu & Migration](development/database-and-migrations.md) — Quản lý lịch sử nâng cấp schema với Alembic và SQL migrations.
- [Quy chuẩn đóng góp nội bộ](development/contributing.md) — Tiêu chuẩn code, quy trình PR và kỷ luật kiểm tra trước khi commit.
- [Checklist tích hợp dịch vụ mới](development/new-service-checklist.md) — Hướng dẫn từng bước khi tạo mới một microservice trong hệ thống.
- [Chiến lược kiểm thử (Testing Strategy)](development/testing-strategy.md) — Quy chuẩn viết Unit test, Integration test, E2E và đánh giá Agent.
- [Danh mục quyết định kiến trúc (ADRs)](adr/README.md) — Lưu trữ 7 quyết định thiết kế cốt lõi của dự án (NestJS, Logical DB, REST, Tool Gateway, Auth, Address, Patient).
- [Báo cáo tiến độ dự án](project-status.md) — Tổng kết kết quả audit và hiện trạng hoàn thành tính năng.

---

### 5. Đánh Giá & Kiểm Thử Năng Lực (Evaluation)
- [Tổng quan hệ thống đánh giá Agent](../eval/README.md) — Phương pháp luận và bộ công cụ đo lường độ chính xác của AI Agent.
- [Kịch bản đánh giá thủ công (Manual Cases)](../eval/manual-cases.md) — Danh sách các ca kiểm thử hành vi hội thoại và phản hồi.
- [Báo cáo kết quả đánh giá Gate G2](../eval/results/gate-g2-mvp-eval.md) — Kết quả chạy thực tế của bộ test Gate G2 với tỷ lệ đạt 6/7.

---

> [!NOTE]
> - Thư mục `docs/guide/` là tài liệu mẫu khóa học của ban tổ chức mang tính tham khảo (`Legacy reference only`), không phải tài liệu vận hành chính thức của X-One.
> - Thư mục `docs/AI_Concierge_Project_Docs/` là các tài liệu lập kế hoạch ban đầu, được lưu giữ nhằm phục vụ việc đối chiếu lịch sử phát triển.
