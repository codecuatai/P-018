# ADR-0001: NestJS Là Bộ Điều Phối Trung Tâm (NestJS Central Orchestrator)

Trạng thái: Đã chấp thuận (Accepted)

## Ngữ cảnh (Context)

Các ứng dụng client (Web / Mobile) cần một backend công khai ổn định duy nhất, trong khi các luồng nghiệp vụ của người dùng trải dài qua nhiều domain dịch vụ (Food, Ride, Restaurant, Healthcare) kết hợp với tương tác hội thoại AI.

## Quyết định (Decision)

API Gateway xây dựng bằng NestJS chịu trách nhiệm:
- Cung cấp toàn bộ API công khai cho client.
- Điều phối các luồng nghiệp vụ (workflows) và quản lý trạng thái xác nhận hai bước.
- Cung cấp môi trường thanh toán thử nghiệm (payment sandbox) và ghi nhật ký kiểm toán (audit log).
- Cung cấp các adapter/client dạng typed để kết nối an toàn với các service domain nội bộ.

## Hệ quả (Consequences)

Các domain service giữ được tính độc lập cao; API Gateway trở thành ranh giới điều phối và kiểm soát chính thức.

## Các phương án thay thế đã xem xét (Alternatives Considered)

- Để ứng dụng frontend gọi trực tiếp tới từng domain service độc lập.
- Để cho AI Agent tự do điều phối và gọi trực tiếp tới các domain service.
