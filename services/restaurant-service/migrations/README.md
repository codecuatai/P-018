# Quản Lý Migration Dịch Vụ Restaurant (Restaurant Migrations)

Dịch vụ Restaurant sở hữu chuỗi migration Alembic:
- `versions/0001_restaurant_booking.py`
- `versions/0002_restaurant_idempotency_records.py` (revision `0002_restaurant_idempotency`): Bổ sung snapshot phản hồi theo `actor / operation / key` bền vững.
- `versions/0003_restaurant_legacy_idempotency_backfill.py` (revision `0003_restaurant_legacy_backfill`): Bổ sung bằng chứng tạo/giữ chỗ cũ.
- `versions/0004_restaurant_catalog_provenance.py` (revision `0004_restaurant_catalog`): Bổ sung chất lượng tọa độ/địa chỉ và nguồn gốc dữ liệu cho việc import danh mục nhà hàng Hà Nội.
- `versions/0005_restaurant_catalog_versions.py` (revision `0005_restaurant_versions`): Đăng ký phiên bản tập dữ liệu do Restaurant sở hữu.

Chạy migration bằng lệnh:
```bash
alembic upgrade head
```
từ thư mục `services/restaurant-service/` với biến `DATABASE_URL` đã được thiết lập. Sau đó chạy:
```bash
python scripts/data/catalog/catalog_import.py restaurant --apply
```
để nạp dữ liệu.
