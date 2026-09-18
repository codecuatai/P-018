# Tổng Quan Kiến Trúc Hệ Thống X-One (Architecture Overview)

Tài liệu chính thức dùng cho việc nộp bài và đánh giá kiến trúc mốc Gate G2 là:
👉 [architecture-diagram.md](architecture-diagram.md).

Tài liệu này phân định rạch ròi giữa **phiên bản MVP thực tế hiện tại** và **lộ trình tiến hóa lên môi trường Production**, đồng thời liên kết trực tiếp tới các tài liệu chuyên sâu về runtime, ranh giới dịch vụ, cơ sở dữ liệu, workflow nghiệp vụ và an toàn bảo mật.

---

## Danh Mục Tài Liệu Kiến Trúc (Architecture Documentation Index)

| Tài liệu | Mô tả chi tiết |
| :--- | :--- |
| [architecture-diagram.md](architecture-diagram.md) | Sơ đồ và tài liệu kiến trúc bàn giao mốc Gate G2 (Topology, Control Flow, Target Architecture). |
| [system-overview.md](system-overview.md) | Tổng quan hệ thống, triết lý thiết kế và mục tiêu kỹ thuật tổng thể. |
| [backend-architecture.md](backend-architecture.md) | Kiến trúc NestJS API Gateway và các Python microservices. |
| [agent-architecture.md](agent-architecture.md) | Thiết kế kiến trúc AI Agent Service, LangGraph graph state và tool execution. |
| [runtime-architecture.md](runtime-architecture.md) | Cấu hình Docker Compose, quản lý biến môi trường, mạng nội bộ và healthchecks. |
| [security-architecture.md](security-architecture.md) | An toàn giao dịch, xác thực JWT/RBAC, 2-step confirmation và guardrails. |
| [service-boundaries.md](service-boundaries.md) | Ranh giới sở hữu domain, quy tắc giao tiếp và cô lập cơ sở dữ liệu. |
| [data-architecture.md](data-architecture.md) | Thiết kế cơ sở dữ liệu đa database, quy chuẩn migrations và seed data. |
| [workflows.md](workflows.md) | Đặc tả luồng xử lý nghiệp vụ xuyên dịch vụ (Ride, Food, Restaurant, Healthcare). |
| [current-state.md](current-state.md) | Hiện trạng triển khai chi tiết của toàn bộ các thành phần trong hệ thống. |
| [food-vertical-slice.md](food-vertical-slice.md) | Tài liệu mẫu thiết kế lát cắt dọc chuẩn (Vertical Slice) của dịch vụ Food. |
| [agent-trace-safety-remediation.md](agent-trace-safety-remediation.md) | Báo cáo khắc phục an toàn logging và kiểm soát dữ liệu nhạy cảm của AI Agent. |
| [repository-structure.md](repository-structure.md) | Quy chuẩn cấu trúc Monorepo và phân định trách nhiệm thư mục. |

---

Về danh mục toàn bộ tài liệu dự án: 👉 [docs/README.md](../README.md).
