# Hướng Dẫn Đóng Góp Dự Án X-One (Contributing Guide)

Chào mừng bạn tham gia phát triển dự án **X-One**! Để đảm bảo chất lượng kỹ thuật, tính ổn định và tính toàn vẹn của mã nguồn, mọi thành viên vui lòng tuân thủ các quy tắc sau:

---

### 1. Quy Trình Làm Việc
1. Bắt đầu từ tài liệu [Hướng dẫn phát triển Local](docs/development/local-development.md).
2. Tạo nhánh làm việc có phạm vi rõ ràng (scoped branch) hoặc làm việc trực tiếp trên nhánh `main` theo quy định của nhóm.
3. Giữ mỗi commit/thay đổi tập trung vào một nhiệm vụ cụ thể.

---

### 2. Kỷ Luật Kiểm Tra Chất Lượng Trước Khi Đẩy Code
Trước khi tạo PR hoặc đẩy code lên remote, bạn bắt buộc phải chạy các lệnh kiểm tra tự động sau:

```powershell
# 1. Xác thực tính nhất quán của biến môi trường
python scripts/quality/validate-env-config.py

# 2. Kiểm tra tính hợp lệ của cấu hình Docker Compose
docker compose --env-file .env.example config --quiet

# 3. Kiểm tra tính đồng bộ của các migration CSDL
python scripts/database/check-migration-parity.py

# 4. Chạy lint và test tương ứng với phân hệ bạn sửa đổi
```

---

### 3. Nguyên Tắc Thay Đổi Codebase
- **Thay đổi API**: Phải cập nhật OpenAPI/Tool contracts tương ứng, cập nhật typed client (nếu có), bổ sung kiểm thử (test) và cập nhật tài liệu [Danh mục API](docs/api/api-inventory.md).
- **Thay đổi Cơ sở dữ liệu**: Phải có migration có kiểm soát (Alembic hoặc SQL script do service sở hữu), kèm kế hoạch seed dữ liệu tất định và cập nhật [Kiến trúc dữ liệu](docs/architecture/data-architecture.md).
- **Tuyệt đối không**:
  - Không commit secret, file `.env`, API key cá nhân vào git.
  - Không truy vấn chéo cơ sở dữ liệu của dịch vụ khác (Cross-database query).
  - Không bypass các pre-push hook kiểm tra.
  - Không khai báo một tính năng khung (skeleton) thành một tính năng nghiệp vụ đã hoàn thành (`implemented`).

---

### 4. Tiêu Chuẩn Review Code
Người review sẽ kiểm tra:
1. **Ranh giới dịch vụ (Service boundaries)**: Đảm bảo Web/Mobile chỉ gọi Gateway, Gateway là bộ điều phối, Domain Service nắm giữ state transition.
2. **Tính idempotent và xác nhận (Idempotency & Confirmation)**: Mọi thao tác ghi hoặc có chi phí bắt buộc phải có Idempotency Key và xác nhận rõ ràng từ người dùng.
3. **Quản lý lỗi an toàn (Safe errors)**: Không trả stack trace hoặc thông tin nhạy cảm về phía client.
4. **Cập nhật tài liệu đồng bộ**: Mã nguồn thay đổi thì tài liệu kiến trúc/hướng dẫn liên quan phải được cập nhật ngay trong cùng một patch.
