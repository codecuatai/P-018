# Dữ Liệu Khởi Tạo Dịch Vụ Ride (Ride Seeds)

Script `seed_demo_drivers.py` bổ sung và duy trì 36 tài xế giả lập tất định tại khu vực Hà Nội (xe máy, ô tô 4 chỗ và ô tô 7 chỗ). Script bảo toàn các phân công chuyến đi đang diễn ra và không bao giờ xóa các dòng dữ liệu của Ride. Lệnh phát triển dùng chung sẽ chạy script này sau khi các migration của Ride đã được áp dụng:

```bash
sh scripts/database/seed.sh .env
```
