# Cấu Trúc Mã Nguồn Monorepo (Repository Structure)

Repository của **X-One** được tổ chức theo cấu trúc **Monorepo** với ranh giới phân định rõ ràng giữa các ứng dụng giao diện (apps), các dịch vụ nghiệp vụ (services), các gói chia sẻ kỹ thuật (packages), hạ tầng (infra) và kịch bản vận hành (scripts).

---

### 1. Sơ Đồ Cây Thư Mục Tổng Thể

```text
P-018/
├── apps/                 # Các ứng dụng người dùng và bộ điều phối trung tâm
│   ├── api-gateway/      # NestJS API Gateway (Điều phối, Auth, Confirmation, Tools)
│   ├── agent-service/    # AI Agent Service (FastAPI, LangGraph, Gemini, Fallback)
│   ├── web/              # Ứng dụng Web chính (Next.js App Router, React 19)
│   └── mobile/           # Ứng dụng di động (React Native / Expo skeleton)
│
├── services/             # Các microservices nghiệp vụ độc lập (Domain Microservices)
│   ├── ride-service/     # Dịch vụ đặt xe, báo giá lộ trình, mô phỏng tài xế
│   ├── restaurant-service/# Dịch vụ đặt bàn nhà hàng, kiểm tra bàn ăn dine-in
│   ├── healthcare-service/# Dịch vụ đặt lịch khám bệnh, danh mục bác sĩ/chuyên khoa
│   └── food-service/     # Dịch vụ đặt món, giỏ hàng, thực đơn và giao đồ ăn
│
├── packages/             # Các gói kỹ thuật dùng chung (Không chứa business logic)
│   ├── contracts/        # Đặc tả OpenAPI và JSON schema hợp đồng dịch vụ
│   ├── generated-ts-clients/ # Client TypeScript tự động sinh từ OpenAPI (Không sửa tay)
│   └── shared-config/    # Cấu hình kỹ thuật dùng chung (ESLint, Prettier, TypeScript)
│
├── infra/                # Cấu hình hạ tầng cục bộ
│   └── postgres/init/    # Kịch bản SQL khởi tạo 6 CSDL logic ban đầu
│
├── data/                 # Dữ liệu tĩnh phiên bản hóa (Static Catalog Snapshots)
│   ├── food-service/     # Dữ liệu nhà hàng và thực đơn món ăn tại Hà Nội
│   ├── restaurant-service/# Dữ liệu nhà hàng đặt bàn
│   └── healthcare-service/# Dữ liệu bệnh viện, bác sĩ và chuyên khoa
│
├── scripts/              # Tập hợp kịch bản tự động hóa và phát triển
│   ├── local/            # Khởi chạy môi trường local (start-all, dev, local-dev)
│   ├── database/         # Quản lý migration, kiểm tra đồng bộ, seed dữ liệu
│   ├── data/             # Kịch bản nạp catalog (DataOps)
│   ├── quality/          # Kiểm tra tính nhất quán biến môi trường và chạy test
│   ├── setup/            # Cài đặt môi trường ban đầu, pre-push hook
│   └── ai-logging/       # Ghi nhận và nộp log AI tự động
│
├── tests/                # Bộ kiểm thử tích hợp xuyên dịch vụ và E2E
│   ├── e2e/              # Kiểm thử luồng tích hợp Gateway - Domain
│   └── contract/         # Kiểm thử tính tương thích của hợp đồng API
│
├── eval/                 # Bộ kịch bản và dữ liệu đánh giá năng lực AI Agent
├── docs/                 # Toàn bộ tài liệu kiến trúc, API, ADR và hướng dẫn phát triển
├── docker-compose.yml    # File cấu hình Docker Compose chuẩn doanh nghiệp
└── .env.example          # File mẫu các biến môi trường của dự án
```

---

### 2. Nguyên Tắc Phân Định Trách Nhiệm Thư Mục

1. **Ranh giới thư mục là ranh giới sở hữu (Ownership follows Directory Boundaries)**:
   - Mỗi thư mục trong `services/` là một đơn vị sở hữu khép kín: có mã nguồn `src/`, file quản lý dependencies `pyproject.toml`, migrations và seeds riêng.
   - Không được phép import code hoặc truy vấn cơ sở dữ liệu của service khác.
2. **Vai trò của thư mục `packages/`**:
   - `packages/` **chỉ chứa các công cụ kỹ thuật ổn định**: OpenAPI contracts, generated client và cấu hình linter.
   - **Tuyệt đối cấm** đặt business logic dùng chung (shared business logic) hoặc chia sẻ ORM entities trong `packages/` để tránh tạo ra monolith ẩn.
3. **Quy tắc với Generated Clients**:
   - Thư mục `packages/generated-ts-clients/` được sinh tự động từ các file OpenAPI. **Tuyệt đối không sửa tay** các file này; mọi thay đổi phải bắt đầu từ việc cập nhật file hợp đồng OpenAPI rồi chạy script build lại client.
4. **Quy trình thêm một dịch vụ mới**:
   - Thực hiện theo [Checklist tích hợp dịch vụ mới](../05-development/new-service-checklist.md): Tạo thư mục trong `services/`, cấu hình Dockerfile, viết migration, cập nhật Gateway client và bổ sung tài liệu trong cùng một lượt commit.
