# Bố Cục Thư Mục Script (Script Layout)

Các script trong kho mã nguồn được phân nhóm theo mục đích trách nhiệm:

| Thư mục | Mục đích sử dụng |
| --- | --- |
| `local/` | Khởi động Compose cục bộ và tiến trình trực tiếp, kiểm tra sức khỏe (health checks), nghiệm thu và tắt tiến trình |
| `database/` | Chạy migrations, nạp seeds, reset dữ liệu trong phạm vi an toàn, và kiểm tra tính tương đồng migration |
| `data/` | Pipeline xử lý dữ liệu, wrapper import domain, và triển khai import danh mục catalog |
| `quality/` | Bộ chạy kiểm thử, kiểm tra tính hợp lệ của môi trường, kiểm tra hiệu năng khói và test script |
| `setup/` | Khởi tạo repository ban đầu, thiết lập môi trường và cài đặt hook AI |
| `ai-logging/` | Hook ghi log sử dụng AI, chuẩn hóa nhật ký, nộp bài và các launcher Python |
| `admin/` | Helper tạo và cấp quyền tài khoản quản trị viên cục bộ |
| `integrations/` | Công cụ tích hợp QA bên ngoài (ví dụ: đính kèm thẻ Trello) |

Luôn thực thi các lệnh từ thư mục gốc của kho lưu trữ để các đường dẫn tương đối và việc nạp biến môi trường luôn nhất quán.

### Các Điểm Vào Phổ Biến Nhất:

```powershell
# Khởi động toàn bộ stack với Docker Compose
./scripts/local/start-all.ps1

# Khởi động runtime tiến trình trực tiếp (local development)
./scripts/local/local-dev.ps1

# Kiểm tra trạng thái sức khỏe của các service
./scripts/local/local-health.ps1

# Dừng runtime tiến trình trực tiếp
./scripts/local/local-stop.ps1

# Kiểm tra tính hợp lệ của cấu hình biến môi trường
python scripts/quality/validate-env-config.py

# Kiểm tra tính tương đồng của các tệp migration
python scripts/quality/check-migration-parity.py
```
