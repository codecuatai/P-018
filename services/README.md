# Các Dịch Vụ Domain (Domain Services)

Mỗi domain service sở hữu độc quyền một miền nghiệp vụ có ranh giới rõ ràng (bounded context) và một cơ sở dữ liệu logic riêng biệt. Cấu trúc mã nguồn chung tuân thủ: `api` → `application` → `domain`, kết hợp với các interface repository và adapter tại ranh giới lưu trữ dữ liệu. Vui lòng đọc kỹ [AGENTS.md](../AGENTS.md) trước khi chỉnh sửa.

## Chạy Dịch Vụ Độc Lập

Bạn có thể chạy độc lập từng service bằng cách tham khảo các biến môi trường trong tệp `.env.example` của service đó và khởi chạy entry point FastAPI:

```bash
uvicorn src.main:app --host 0.0.0.0 --port 8101 --reload
```

Để chạy toàn bộ hệ thống tích hợp, chỉ sử dụng duy nhất tệp gốc `.env` và Docker Compose thông qua các script khởi động tại `scripts/`.

## Kiểm Thử & Migration

- Chạy kiểm thử từ thư mục của service: `python -m pytest tests -q`.
- Khi thay đổi schema cơ sở dữ liệu, bắt buộc phải tạo một revision Alembic (hoặc script migration SQL tuần tự) mới trong thư mục `migrations/` của chính service đó, kèm theo fixture dữ liệu tất định trong `seeds/` khi cần thiết.

## Thêm Dịch Vụ Mới

Để bổ sung một domain service mới vào hệ thống, hãy tuân thủ nghiêm ngặt [Danh sách kiểm tra khi thêm dịch vụ mới](../docs/development/new-service-checklist.md): tạo khung service, cấp phát database/user logic trong PostgreSQL, cấu hình Compose/môi trường, viết typed client tại API Gateway, định nghĩa hợp đồng OpenAPI/tool, viết kiểm thử và cập nhật đồng thời toàn bộ tài liệu kiến trúc liên quan.
