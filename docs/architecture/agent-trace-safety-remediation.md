# Khắc Phục An Toàn Tracing Của Agent (Agent Trace Safety Remediation)

Ghi chú này lưu lại các vấn đề quan sát được trong tệp xuất Langfuse 198 sự kiện và các biện pháp kiểm soát đã được triển khai khắc phục.

## Các vấn đề quan sát được

- Toàn bộ 14 trace gốc của planner đều thiếu hồ sơ người dùng, các tin nhắn gần đây và trạng thái hội thoại.
- Trace của Food agent sử dụng trạng thái `COMPLETED` cho một lượt tương tác của agent vốn chỉ mới đề xuất một bước tiếp theo cần Gateway xác thực.
- Trace của Composer có thể nhận nhiều lựa chọn hơn mức giao diện người dùng nên hiển thị và có thể sử dụng từ ngữ báo thành công quá sớm (premature success).
- Các quan sát ở tầng generation và định tuyến chứa cả prompt thô hoặc tin nhắn thô của người dùng.
- Bộ phân loại từ khóa của Gateway có thể ghi đè lên một kế hoạch Agent dạng typed hợp lệ.

## Các biện pháp kiểm soát đã triển khai

- Gateway gửi tối đa 20 tin nhắn gần nhất kèm theo hồ sơ người dùng và các địa chỉ đã lưu thuộc phạm vi của actor.
- Các tác vụ đã hoàn thành được giữ lại làm lịch sử của planner và không thể bị loại bỏ bởi đầu ra của mô hình LLM.
- Kế hoạch Agent dạng typed không rỗng không còn bị phân loại lại bởi danh sách từ khóa của Gateway.
- Trạng thái lượt tương tác của Agent tách biệt hoàn toàn với trạng thái workflow của domain: `NEEDS_INPUT`, `PROPOSAL_READY`, hoặc `ERROR`.
- Đầu vào của Composer chỉ để lộ các trường công khai có giới hạn, tối đa 3 envelope kết quả và tối đa 3 lựa chọn cho mỗi danh sách.
- Từ ngữ thông báo thành công sớm bị từ chối trừ khi có kết quả thẩm quyền `booking_confirmed` hoặc `order_confirmed` chính thức từ domain.
- Khả năng quan sát (observability) chỉ ghi nhận độ dài tin nhắn/prompt và metadata có giới hạn thay vì lưu trữ tin nhắn thô của người dùng hoặc prompt thô trên các tuyến đường đã được cập nhật.

API Gateway và các domain service luôn giữ thẩm quyền tuyệt đối đối với việc xác nhận, tính idempotent, phiên bản tài nguyên, giá cả, bàn/chuyến trống và trạng thái giao dịch cuối cùng.
