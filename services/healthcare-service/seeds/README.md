# Dữ Liệu Khởi Tạo Dịch Vụ Healthcare (Healthcare Seeds)

Lệnh phát triển dùng chung sử dụng job `catalog-importer` của Compose để import danh mục Healthcare, tạo các khung giờ tương lai cho các bác sĩ đã có giá niêm yết, sau đó chạy `seed_demo_patient.py`.

Script này tạo bổ sung hồ sơ bệnh nhân và liên kết bản thân cho tài khoản demo phát triển đã cấu hình; nó không bao giờ chạy khi demo authentication bị tắt.

```bash
sh scripts/database/seed.sh .env
```

`seed_medical.py` là fixture phá hủy dữ liệu cũ và không nằm trong quy trình phát triển hay triển khai chính thức. Người dùng đã đăng ký tự tạo và chọn liên kết bệnh nhân thông qua ranh giới API Gateway.
