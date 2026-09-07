# ADR-0006: Quyền Sở Hữu Địa Chỉ Đã Lưu Và Snapshot Địa Chỉ Giao Dịch (Address Ownership)

- Trạng thái: Đã chấp thuận và đã triển khai (Accepted & Implemented)
- Ngày: 2026-08-10
- Chủ sở hữu: Core / API Gateway, Food, Ride

## Quyết định (Decision)

Dịch vụ Core / API Gateway sở hữu sổ địa chỉ đã lưu của người dùng X-One (`saved addresses`). Các dịch vụ Food và Ride sở hữu **snapshot địa chỉ bất biến** được chụp tại thời điểm ghi nhận giao dịch/đơn hàng/chuyến đi tương ứng. Bất kỳ chỉnh sửa nào đối với địa chỉ đã lưu sau này cũng **tuyệt đối không làm thay đổi** snapshot địa chỉ của giao dịch cũ trong lịch sử.

API Gateway phân giải địa chỉ đã lưu thông qua hợp đồng địa chỉ theo actor do Core sở hữu, sau đó truyền snapshot đã chuẩn hóa sang cho domain service xử lý. Food và Ride không bao giờ truy vấn trực tiếp cơ sở dữ liệu của Core, không tạo khóa ngoại chéo database và không import mô hình ORM của Core. Các domain service tự validate và lưu trữ các trường snapshot của riêng mình.

## Tính Tương Thích & Di Chuyển

Bảng `user_addresses` của Core được triển khai thông qua migration `010_core_personal_context.sql`; các client công khai gọi qua Gateway `/api/v1/addresses` và `/api/v1/location/*`.

Khi tạo đơn hàng Food, adapter của Gateway chuyển đổi địa chỉ Core thuộc sở hữu của actor sang hợp đồng `Address` dùng chung, sau đó gửi một snapshot bất biến sang cho Food. Các đơn hàng Food cũ vẫn đọc dữ liệu trực tiếp từ snapshot đã lưu trong bảng của Food mà không cần phải chạy script backfill hay sửa đổi chéo database.

## Hệ quả (Consequences)

ID địa chỉ chỉ là các tham chiếu tại ranh giới của API Gateway, không phải là định danh khóa ngoại chia sẻ trong cơ sở dữ liệu. Chủ sở hữu có thẩm quyền của địa chỉ đã lưu (Core) và chủ sở hữu của snapshot giao dịch (Food/Ride) luôn tách biệt rõ ràng và có thể kiểm thử độc lập.
