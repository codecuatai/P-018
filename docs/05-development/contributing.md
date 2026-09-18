# Hướng Dẫn Đóng Góp Phát Triển (Development Contribution Guide)

Tài liệu này quy định các chuẩn mực kỹ thuật và quy trình đóng góp mã nguồn cho các kỹ sư và cộng tác viên trong dự án X-One.

## 1. Nguyên Tắc Cốt Lõi (Core Principles)

- **Sử dụng cấu hình gốc**: Toàn bộ stack chỉ sử dụng tệp `.env` ở thư mục gốc và Docker Compose. Không sao chép các khóa bí mật vào các service con.
- **Tôn trọng ranh giới kiến trúc**: 
  - Web và Mobile chỉ gọi vào API Gateway.
  - Gateway điều phối luồng nhưng không sở hữu dữ liệu domain hay can thiệp SQL trực tiếp.
  - Mỗi domain service sở hữu độc quyền một logical database riêng.
  - AI Agent chỉ phát ra đề xuất typed, không bao giờ được phép trực tiếp thực thi giao dịch tài chính hay truy cập cơ sở dữ liệu.
- **Trung thực về trạng thái**: Chỉ đánh dấu `implemented` khi có mã nguồn thực tế và bài kiểm tra dẫn chứng cụ thể; đánh dấu `skeleton` nếu mới có khung định tuyến; và `planned` nếu đang nằm trong kế hoạch.

## 2. Quy Trình Làm Việc Với Nhánh & Git

- Mọi công việc hiện tại được tích hợp trực tiếp và đồng bộ trên nhánh `main`.
- Đảm bảo kiểm tra `git status --short` trước và sau khi thực hiện thay đổi.
- Không commit các tệp rác, tệp môi trường `.env`, mã nhị phân không cần thiết hoặc các bản ghi log tạm thời.

## 3. Quy Chuẩn Thay Đổi Mã Nguồn

### Khi Thay Đổi API hoặc Hợp Đồng (Contracts)
1. Cập nhật hợp đồng OpenAPI hoặc schema công cụ trong `packages/contracts/`.
2. Tạo hoặc cập nhật Typed Client tương ứng trong `apps/api-gateway/src/modules/`.
3. Bổ sung các bài kiểm thử tương thích (contract tests) và unit tests.
4. Cập nhật tài liệu tại `docs/03-api/api-inventory.md` và `docs/03-api/tool-contracts.md`.

### Khi Thay Đổi Cơ Sở Dữ Liệu
1. Tạo migration mới có tính bổ sung (additive):
   - Đánh số thứ tự tăng dần tiếp theo cho migration SQL thuần.
   - Hoặc tạo revision mới từ `head` nếu dùng Alembic.
2. Tuyệt đối không chỉnh sửa các migration cũ đã từng được áp dụng.
3. Cập nhật tài liệu kiến trúc dữ liệu tại `docs/02-architecture/data-architecture.md`.
4. Viết các bài kiểm thử xác minh tính idempotent và khả năng rollback nếu có.

## 4. Cổng Kiểm Tra Chất Lượng Cục Bộ (Quality Gates)

Trước khi gửi PR hoặc bàn giao mã nguồn, bắt buộc phải chạy và vượt qua các lệnh kiểm tra sau:

```powershell
# 1. Kiểm tra cấu hình và Compose
python scripts/quality/validate-env-config.py
docker compose --env-file .env.example config --quiet
python scripts/database/check-migration-parity.py

# 2. Kiểm tra Gateway
corepack pnpm --dir apps/api-gateway run lint
corepack pnpm --dir apps/api-gateway test
corepack pnpm --dir apps/api-gateway run build

# 3. Kiểm tra Web
corepack pnpm --dir apps/web run lint
corepack pnpm --dir apps/web run typecheck
corepack pnpm --dir apps/web test
corepack pnpm --dir apps/web run build

# 4. Kiểm tra Python
pytest services/ride-service/tests
pytest services/food-service/tests
pytest services/restaurant-service/tests
pytest services/healthcare-service/tests
pytest apps/agent-service/tests
```

## 5. Những Điều Bị Từ Chối Khi Review (Review Rejections)

Người review hoặc hệ thống CI/CD sẽ tự động từ chối nếu phát hiện:
- Có khóa bí mật, API key, hoặc mật khẩu thô trong mã nguồn hoặc commit log.
- Xuất hiện truy vấn SQL chéo giữa các logical database của các domain khác nhau.
- Thiếu cơ chế xác nhận 2 bước cho các giao dịch tài chính hoặc giữ chỗ.
- Bỏ qua header `Idempotency-Key` cho các thao tác ghi có rủi ro.
- Xử lý lỗi cẩu thả: sử dụng bare `except` trong Python hoặc bỏ qua bắt lỗi trong TypeScript.
- Dùng `create_all()` để tự động sinh bảng trong môi trường production.
