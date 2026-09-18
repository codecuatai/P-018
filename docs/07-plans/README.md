# Kế Hoạch Nâng Cấp & Tối Ưu Hóa Kỹ Thuật (Engineering Plans)

Thư mục này lưu trữ các bản kế hoạch kỹ thuật, lộ trình refactor kiến trúc và chiến lược nâng cấp từng phân hệ trong dự án **X-One**.

---

## Danh Mục Kế Hoạch

### 1. Phân Hệ Trí Tuệ Nhân Tạo & Agent (AI Core & Agent Service)
- [agent-service-single-agent-plan.md](agent-service-single-agent-plan.md) — Kế hoạch tái cấu trúc Agent Service thành mô hình Single-Agent LangGraph với intent routing tập trung.
- [ai-core-a-b-refactor-plan.md](ai-core-a-b-refactor-plan.md) — Kế hoạch A/B refactor bộ xử lý hội thoại AI, giảm độ trễ và tăng tính tất định.
- [core-agent-10-point-remediation-plan.md](core-agent-10-point-remediation-plan.md) — Kế hoạch 10 điểm khắc phục an toàn, xử lý triệt để các rủi ro bảo mật prompt và rò rỉ dữ liệu.
- [core-agent-langfuse-safe-tracing-plan.md](core-agent-langfuse-safe-tracing-plan.md) — Thiết kế cơ chế theo dõi an toàn (Safe Tracing) qua Langfuse, che giấu dữ liệu nhạy cảm (PII redaction).
- [core-agent-production-upgrade-plan.md](core-agent-production-upgrade-plan.md) — Lộ trình nâng cấp Agent Service từ bản MVP lên chuẩn Production.

### 2. Dịch Vụ Miền & Tích Hợp (Domain Services & Integrations)
- [restaurant-service-improvement-plan.md](restaurant-service-improvement-plan.md) — Kế hoạch cải tiến dịch vụ nhà hàng: đặt bàn theo ca, tính toán cọc và quản lý bàn trống.
- [provider-mcp-integration-plan.md](provider-mcp-integration-plan.md) — Kế hoạch tích hợp giao thức Model Context Protocol (MCP) kết nối các hệ thống đối tác bên thứ ba.
- [gateway-real-data-ui-integration-worklog.md](gateway-real-data-ui-integration-worklog.md) — Kế hoạch và nhật ký tích hợp dữ liệu thực từ PostgreSQL lên giao diện người dùng.

### 3. Nghiệp Vụ Vận Hành & Kịch Bản Thực Tế (Operations & Scenarios)
- [admin-operations-plan.md](admin-operations-plan.md) — Kế hoạch xây dựng cổng quản trị vận hành (Admin/Manager Portal), xử lý đối soát và xử lý khiếu nại.
- [real-world-service-scenarios-plan.md](real-world-service-scenarios-plan.md) — Thiết kế các kịch bản đời thực cho 4 dịch vụ (Đặt xe, Giao món, Đặt bàn, Khám bệnh).
- [implementation-plan-25-cases.md](implementation-plan-25-cases.md) — Kế hoạch chi tiết triển khai và kiểm thử 25 trường hợp kiểm thử nghiệp vụ then chốt.
