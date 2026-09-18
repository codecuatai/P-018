# Cơ Sở Dữ Liệu và Quản Lý Migration (Database and Migrations)

Script khởi tạo PostgreSQL cục bộ nhận tên cơ sở dữ liệu, tài khoản sở hữu và mật khẩu thông qua ánh xạ rõ ràng trong Compose. Nó tạo 6 cơ sở dữ liệu logic với các chủ sở hữu tách biệt và tuyệt đối không cấp quyền truy cập chéo giữa các service.

Các file đặt trong thư mục `/docker-entrypoint-initdb.d` chỉ được thực thi một lần duy nhất khi PostgreSQL khởi tạo volume `postgres_data` mới. Việc thay đổi biến môi trường trong `.env` sau đó sẽ không cập nhật volume đã tồn tại. Đối với cơ sở dữ liệu đã tồn tại, phải áp dụng các migration hoặc thay đổi role một cách chủ động; tuyệt đối không tự ý xóa volume dữ liệu của người dùng.

Dịch vụ Core sở hữu các migration SQL có tính bổ sung (additive) từ `001_core_vertical_slice.sql` đến `016_core_token_usage.sql`. Cụ thể:
- Migration 007 lưu trữ biên lai hành động Assistant an toàn cho việc replay cùng key bền vững.
- Migration 008 bổ sung các lỗi có thể thử lại và thời hạn xử lý có giới hạn (bounded processing lease).
- Migration 009 bổ sung bảng người dùng, mã băm mật khẩu Argon2id, thế hệ phiên refresh và mã băm reset-token dùng một lần do Core sở hữu.
- Migration 010 bổ sung ngữ cảnh hồ sơ, địa chỉ đã lưu và hội thoại.
- Migration 011 lưu trữ kế hoạch workflow đa dịch vụ và tính idempotent cho từng bước.
- Migration 012 bổ sung các bản ghi Product/Ops.
- Migration 013 bổ sung bằng chứng idempotency cho các cập nhật hỗ trợ của Admin.
- Migration 015 bổ sung metadata mã hóa cho API key của Admin.
- Migration 016 lưu trữ dữ liệu tổng hợp mức sử dụng token do Core sở hữu.

Dịch vụ Food sở hữu các migration từ `001` đến `006`; Restaurant sở hữu các revision Alembic từ `0001` đến `0005`; Healthcare sở hữu các migration SQL `001`, `002`, `003`, `003a`, `004`, và `005`; Ride sở hữu các revision Alembic đến `20260827_0007_quote_snapshot`. Revision `20260827_0007_quote_snapshot` bổ sung một snapshot JSON báo giá bất biến vào `ride_bookings`, cho phép các phản hồi lịch sử và hủy chuyến giữ nguyên tuyến đường, biểu phí, số tiền và loại tiền tệ có thẩm quyền sau khi báo giá trực tiếp thay đổi. Mỗi chủ sở hữu kiểm soát ranh giới dữ liệu của riêng mình.

## Chính Sách Quản Lý Migration (Migration Policy)

Các migration đã được áp dụng là **bất biến** (immutable). Tuyệt đối không chỉnh sửa, đổi thứ tự, đánh lại số hiệu hay âm thầm thay thế một migration có thể đã được chạy. Mọi thay đổi schema phải có tính bổ sung (additive), do chính service sở hữu dữ liệu chịu trách nhiệm, và đi kèm ghi chú tương thích hoặc kế hoạch rollback, các bài kiểm thử, thay đổi seed tất định khi cần thiết và cập nhật tài liệu kiến trúc dữ liệu. Không dùng `create_all()` lúc runtime, không chạy migration phá hủy khi khởi động, không viết SQL chéo service, không dùng chung mô hình ORM và không xóa volume để sửa lỗi trạng thái.

| Bên sở hữu | Baseline hiện tại | Quy ước migration tiếp theo |
| --- | --- | --- |
| **Core / Gateway** | `001` đến `016` (SQL thuần) | `017` trở lên, SQL bổ sung |
| **Food** | `001` đến `006` (SQL thuần) | `007` trở lên, SQL bổ sung |
| **Healthcare** | `001`, `002`, `003`, `003a`, `004`, `005` (SQL thuần) | `006` trở lên, SQL bổ sung |
| **Restaurant** | Alembic `0001` đến `0005` | Tạo revision Alembic mới từ `head` |
| **Ride** | Alembic đến `20260827_0007_quote_snapshot` | Tạo revision Alembic mới từ `head` |

Trong môi trường phát triển, Gateway tự động chạy các migration SQL của Core khi khởi động nếu `APP_ENV=development` và `CORE_AUTO_MIGRATE=true`; Compose mặc định bật cờ này. Trình chạy migration sử dụng PostgreSQL advisory lock, ghi lại tên các tệp đã áp dụng vào bảng `core_migrations_log`, và sẽ báo lỗi dừng khởi động nếu thư mục migration bị thiếu hoặc rỗng. Trên môi trường production, bắt buộc phải tắt cờ này (`CORE_AUTO_MIGRATE=false`) và chạy migration thông qua bước triển khai độc lập.

Chạy lệnh kiểm tra tính tương đồng migration:
```bash
python scripts/database/check-migration-parity.py
```

Bộ khởi chạy đầy đủ thực thi `scripts/migrate.ps1 .env` (hoặc `scripts/migrate.sh .env`) sau khi các container Compose đạt trạng thái healthy và có thể chạy lặp lại các migration bổ sung một cách an toàn (idempotent). Các migration Alembic chạy trong container tạm thời (one-shot) được tạo từ chính image mới của service, do đó quá trình triển khai không bao giờ chạy migration mới bên trong container service cũ đang chạy.

Ride cũng chứa đường dẫn tương thích an toàn cho các cơ sở dữ liệu đã từng ghi nhận revision `0007` ngắn hạn trước đây; nó sẽ kiểm tra schema của quote snapshot trước khi điều chỉnh lại đánh dấu phiên bản Alembic. Quy trình sẽ dừng lại ngay khi phát hiện lỗi ở bất kỳ bước nào và không bao giờ xóa volume. Dữ liệu seed không nằm trong quy trình restart thông thường: hãy truyền cờ `-SeedDemo` / `--seed-demo` một cách tường minh khi cần nạp dữ liệu.

Các bài unit test ứng dụng Core sử dụng repository in-memory để đảm bảo tốc độ và tính tất định. Các bài test kiểm tra việc lưu trữ thực tế trên PostgreSQL của Core và Auth sử dụng `CORE_TEST_DATABASE_URL`; Auth yêu cầu thêm `AUTH_TEST_DATABASE_URL` cho kiểm thử cô lập. Kiểm tra tái sử dụng khung giờ (slot) của Healthcare sử dụng `HEALTHCARE_TEST_DATABASE_URL` với mục tiêu dùng một lần.
