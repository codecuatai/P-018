# Quản Lý Migration Dịch Vụ Food (Food Migrations)

Chạy các tệp từ `001_food_vertical_slice.sql` đến `008_food_catalog_search.sql` đối chiếu với cơ sở dữ liệu `xone_food`. Các migration mang tính bổ sung (additive):
- Đánh dấu các workflow đến hạn xử lý,
- Khóa hàng tài xế chuẩn hóa (normalized driver locking),
- Khấu trừ voucher,
- Quản lý phiên bản giỏ hàng/đơn hàng,
- Đánh chỉ mục giao dịch,
- Đảm bảo tính idempotent cho chuyển trạng thái và thao tác ghi giỏ hàng,
- Băm payload giỏ hàng,
- Phân vùng địa chỉ theo actor,
- Truy xuất nguồn gốc danh mục có phiên bản,
- Cột và chỉ mục tìm kiếm món ăn không phân biệt dấu tiếng Việt.

Sau khi migration hoàn tất, sử dụng lệnh:
```bash
python scripts/data/catalog/catalog_import.py food --apply
```
để nạp danh mục thực phẩm.
