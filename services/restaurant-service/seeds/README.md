# Dữ Liệu Khởi Tạo Dịch Vụ Restaurant (Restaurant Seeds)

`seed.py` tạo các bảng và dữ liệu giờ mở cửa tất định riêng cho dịch vụ Restaurant sau khi các migration đã được áp dụng. Nếu danh mục đã được import từ trước, script sẽ giữ nguyên các dòng nhà hàng đó và chỉ bổ sung các tài nguyên bàn còn thiếu; script không truy cập sang service hay cơ sở dữ liệu khác.

Đối với môi trường dev/demo, mỗi nhà hàng đang hoạt động được đảm bảo có 32 bàn đệm bổ sung dạng `DEMO-XONE-*` với sức chứa 12 người. Đây là vùng đệm công suất tĩnh phục vụ các bài trình diễn luồng chuẩn: việc chạy lại seed chỉ tạo các bàn đệm còn thiếu và không bao giờ xóa hay thay đổi các đơn đặt bàn thực tế, các lượt giữ chỗ đang hoạt động, tài khoản hay lịch sử hội thoại.

Chạy từ thư mục gốc của repository sau khi stack Compose đã hoạt động:

```powershell
./scripts/database/migrate.ps1
./scripts/database/seed.ps1
```

Migration và seed là các bước vận hành tường minh. Service không tự động thay đổi schema khi khởi động ứng dụng.
