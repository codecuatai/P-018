# ADR-0003: Sử Dụng REST Đồng Bộ Cho Giai Đoạn Hiện Tại (Synchronous REST)

Trạng thái: Đã chấp thuận (Accepted)

## Ngữ cảnh (Context)

Nền tảng của dự án cần một phương thức giao tiếp đơn giản, dễ kiểm tra, dễ gỡ lỗi và có độ phức tạp vận hành thấp trong giai đoạn MVP và đánh giá Gate G2.

## Quyết định (Decision)

Sử dụng chuẩn REST / JSON / OpenAPI đồng bộ kèm theo:
- Giới hạn thời gian chờ (bounded timeouts).
- Mã tương quan luồng (`X-Correlation-Id`).
- Cơ chế bảo vệ thao tác ghi an toàn (`Idempotency-Key`).

## Hệ quả (Consequences)

Không đưa các công nghệ hàng đợi tin nhắn (Message Queue), Broker (Kafka, RabbitMQ), Event Sourcing hay khung làm việc CQRS phức tạp vào giai đoạn MVP này.

## Các phương án thay thế đã xem xét (Alternatives Considered)

- Sử dụng Kafka hoặc RabbitMQ kết hợp kiến trúc biên đạo sự kiện bất đồng bộ (event choreography).
