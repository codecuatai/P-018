# ADR-0002: Mỗi Service Sở Hữu Độc Quyền Một Cơ Sở Dữ Liệu Logic (Logical Database Ownership)

Trạng thái: Đã chấp thuận (Accepted)

## Ngữ cảnh (Context)

Một container PostgreSQL dùng chung cho môi trường phát triển cục bộ mang lại sự tiện lợi, nhưng việc dùng chung schema hoặc bảng sẽ gây thắt chặt phụ thuộc (tight coupling) giữa các domain service.

## Quyết định (Decision)

Sử dụng cơ sở dữ liệu và người dùng riêng biệt (`database/user`) cho mỗi service; nghiêm cấm mọi truy vấn SQL chéo cơ sở dữ liệu, khóa ngoại chéo (foreign keys) hoặc chia sẻ mô hình ORM.

## Hệ quả (Consequences)

Các service bắt buộc phải giao tiếp thông qua các hợp đồng API được kiểm soát; việc tách rời thành các cụm máy chủ cơ sở dữ liệu vật lý riêng biệt trong tương lai có thể thực hiện dễ dàng mà không làm thay đổi mã nguồn.

## Làm rõ thêm (Clarification)

Quyền sở hữu logic là bắt buộc ngay từ lát cắt đầu tiên. Cấu hình Docker Compose cục bộ hiện tại sử dụng một máy chủ PostgreSQL duy nhất với 6 database/user logic độc lập; việc phân tách thành các cụm database vật lý sẽ được trì hoãn cho đến khi có nhu cầu đo lường vận hành hoặc tổ chức nhóm thực tế.

## Các phương án thay thế đã xem xét (Alternatives Considered)

- Dùng chung một schema duy nhất và một bộ thông tin xác thực database duy nhất cho toàn bộ hệ thống.
