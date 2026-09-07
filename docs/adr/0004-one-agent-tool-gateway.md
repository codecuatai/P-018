# ADR-0004: Kiến Trúc Một Agent Kết Hợp Tool Gateway (One Agent & Tool Gateway)

Trạng thái: Đã chấp thuận (Accepted)

## Ngữ cảnh (Context)

Quá trình suy luận của mô hình ngôn ngữ lớn (LLM reasoning) vốn có tính bất định, do đó tuyệt đối không được phép tự ý thay đổi dữ liệu hoặc kích hoạt giao dịch trên các hệ thống nghiệp vụ có thẩm quyền.

## Quyết định (Decision)

Sử dụng một AI Agent duy nhất xây dựng trên nền tảng FastAPI / LangGraph để tạo ra các đề xuất gọi công cụ có cấu trúc dạng typed; API Gateway (NestJS) đóng vai trò thẩm định tính hợp lệ, kiểm tra quyền hạn, yêu cầu người dùng xác nhận và trực tiếp gọi thực thi.

## Hệ quả (Consequences)

Các tác dụng phụ (side effects) có thể được kiểm toán đầy đủ và kiểm soát chặt chẽ qua bước xác nhận của người dùng; loại bỏ sự phức tạp không cần thiết của các hệ thống đa agent (multi-agent orchestration) phân tán.

## Các phương án thay thế đã xem xét (Alternatives Considered)

- Cho phép Agent tự gọi trực tiếp tới các domain service.
- Sử dụng mô hình đa agent (multi-agent) với các agent con tự trao đổi và chốt giao dịch.
