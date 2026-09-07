# Dịch Vụ Đồ Ăn (Food Service)

Dịch vụ Food sở hữu danh mục ẩm thực Việt Nam, giỏ hàng theo từng nhà hàng, voucher giảm giá, báo giá phí giao hàng, đơn đặt món ăn, sự kiện trạng thái đơn, tài xế giao hàng và chính sách hủy đơn. Dịch vụ này **tuyệt đối không sở hữu** việc đặt bàn ăn tại chỗ (thuộc về Restaurant) hoặc trạng thái xử lý thanh toán (thuộc về API Gateway).

## Khởi Chạy & Dữ Liệu

Chạy `scripts/database/migrate.ps1` (hoặc `.sh`) và sau đó chạy `scripts/database/seed.ps1` (hoặc `.sh`) khi PostgreSQL đang hoạt động. Quy trình seed nhập tập dữ liệu danh mục Food đã cấu hình và không tạo các nhà hàng hay món ăn demo cố định. Môi trường Compose thiết lập `PERSISTENCE=postgres`; các bài unit test có thể sử dụng adapter `InMemoryFoodRepository`, trong khi `tests/test_postgres_integration.py` kiểm thử trên cơ sở dữ liệu dùng một lần khi `FOOD_TEST_DATABASE_URL` được cấu hình.

Mọi tuyến `/api/v1` đều là API nội bộ và bắt buộc phải có header `X-Internal-Service-Token`; các lệnh gọi gắn với người dùng yêu cầu thêm header khẳng định `X-Actor-Id`.

## Cơ Chế Xem Trước & Worker

Endpoint preview tính toán tạm tính (subtotal), giảm giá từ voucher, phí giao hàng theo công thức Haversine, thời gian giao dự kiến (ETA), tổng tiền, chính sách hủy, phương thức thanh toán hỗ trợ, phiên bản giỏ hàng và mã băm snapshot. Bước này **tuyệt đối không tạo đơn hàng**. Worker của Food tự động thúc đẩy các trạng thái đến hạn theo giao dịch cơ sở dữ liệu mà không cần message broker; worker đối soát của Gateway xử lý việc hoàn tiền khi bị từ chối/hủy đơn một cách độc lập với việc polling của người dùng.
