# Hướng Dẫn Phát Triển & Chuẩn Mực Kỹ Thuật (Development Guidelines)

Thư mục này cung cấp các hướng dẫn chi tiết dành cho kỹ sư phát triển, quy chuẩn môi trường cục bộ, quản lý di chuyển dữ liệu (migrations), bộ quy tắc kiểm thử chất lượng và hướng dẫn dành cho các AI Coding Agents.

---

## Danh Mục Tài Liệu Phát Triển (Development Documentation Index)

| Tài liệu | Phân loại | Mô tả chi tiết |
| :--- | :--- | :--- |
| [local-development.md](local-development.md) | **Getting Started** | Hướng dẫn cài đặt, thiết lập môi trường phát triển cục bộ và vận hành stack với Docker Compose. |
| [contributing.md](contributing.md) | **Contribution Guide** | Quy chuẩn đóng góp mã nguồn, quy trình làm việc với nhánh git, checklist review và quality gates. |
| [environment-variables.md](environment-variables.md) | **Configuration** | Đặc tả toàn bộ các biến môi trường của hệ thống, giá trị mặc định và nguyên tắc Single Source of Truth. |
| [database-and-migrations.md](database-and-migrations.md) | **Database Ops** | Quy trình tạo, áp dụng và kiểm tra tính nhất quán của database migrations (SQL thuần và Alembic). |
| [testing-strategy.md](testing-strategy.md) | **Quality & Testing** | Chiến lược kiểm thử đa tầng: Unit test, Contract test, E2E flow test và AI Agent evaluation. |
| [new-service-checklist.md](new-service-checklist.md) | **Engineering Checklist** | Danh mục 10 bước chuẩn hóa khi bổ sung một microservice nghiệp vụ mới vào hệ thống Monorepo. |
| [ai-agent-instructions.md](ai-agent-instructions.md) | **AI Agent Governance** | Bộ quy tắc và giới hạn bất biến (invariants) dành riêng cho các AI Coding Agents làm việc trên codebase. |

---

## Các Lệnh Thường Dùng Khi Phát Triển Cục Bộ

```powershell
# 1. Khởi động toàn bộ stack hệ thống
powershell -ExecutionPolicy Bypass -File scripts/local/start-all.ps1

# 2. Kiểm tra tính đồng bộ của database migrations
python scripts/database/check-migration-parity.py

# 3. Kiểm tra tính hợp lệ của biến môi trường
python scripts/quality/validate-env-config.py

# 4. Chạy kiểm thử toàn bộ hệ thống
python scripts/quality/run-tests.py
```
