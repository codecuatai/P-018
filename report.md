# Báo cáo: Triển khai ưu tiên luồng y tế (Healthcare Intent)

## 1. Các thay đổi đã thực hiện
- **Tệp tin:** `apps/agent-service/src/agents/intent.py`
- **Chi tiết:** Đã thêm khối mã phát hiện ý định y tế vào đầu hàm `classify`.
  ```python
  # Health intent detection
  if any(value in text for value in ("đau bụng", "đau dạ dày", "đau đầu", "cảm lạnh", "đau lưng")):
      return "healthcare"
  ```
- **Mục đích:** Khối này kiểm tra các từ khóa triệu chứng phổ biến (như "đau bụng", "đau đầu", v.v.) và trả về ý định `"healthcare"`. Điều này giúp hệ thống ưu tiên xử lý các yêu cầu khám chữa bệnh, tránh việc agent nhầm lẫn tạo task đặt đồ ăn (food) khi người dùng đang có nhu cầu sức khỏe.

## 2. Kết quả kiểm thử (Verification)
- Đã chạy bộ test cho **agent-service** (`pytest -q`):
  - **Kết quả:** `144 passed, 1 warning` trong khoảng 27 giây.
  - Toàn bộ các test case hiện có đều vượt qua thành công, đảm bảo rằng thay đổi này không làm ảnh hưởng đến các luồng tính năng khác của hệ thống.

## 3. Các bước tiếp theo (Cập nhật từ Phân tích Log)
- **Hoàn thiện UI Y tế (Từ kế hoạch cũ):** Triển khai UI chọn địa điểm cho người dùng sau khi đã xác định được khoa khám, và thêm thông báo nhắc nhở người dùng hoàn thành luồng đặt lịch khám trước khi chuyển sang đặt món.
- **Khắc phục vòng lặp (Looping) khi hỏi tên bệnh viện (Từ Log 4-7):** Phát hiện lỗi Agent quá cứng nhắc khi bắt buộc người dùng cung cấp tên cơ sở y tế cụ thể. Khi người dùng nói *"không cứ cho tôi gợi ý đi"* hoặc *"ở hà nội là được"*, bot liên tục hỏi lại thay vì hiển thị danh sách gợi ý.
  -> **Hành động:** Điều chỉnh cấu hình Prompt/Planner và nới lỏng yêu cầu bắt buộc (mandatory slots) để kích hoạt lệnh tìm kiếm (Search/Discover) ngay khi người dùng có ý định nhờ gợi ý chung chung.
- **Lưu ý chất lượng dữ liệu (Từ Log 18):** Báo cáo bộ phận kiểm duyệt về việc có cửa hàng đồ ăn chèn số điện thoại dạng chữ ("Không ba bốn , hai không hai...") vào mô tả món ăn để lách luật.

---

## 4. Phân tích và kế hoạch sửa lỗi nhận diện sai `booking_id` (Cancel Operation Bug)

### Nguyên nhân gốc rễ (Root Cause)
- Khi người dùng nhập *"đặt xe về đại học thủy lợi từ đại học Vinuni"*, hệ thống đã nhận diện nhầm hành động thành **Hủy chuyến** (`Operation.CANCEL`).
- Nguyên nhân là do hàm `_operation(text)` trong `apps/agent-service/src/agents/assistant/understanding/interpreter.py` đang sử dụng logic tìm kiếm chuỗi con (substring match) cực kỳ đơn giản: 
  ```python
  if any(value in folded for value in ('hủy', 'huỷ', 'cancel')):
  ```
- Do từ **"thủy"** (trong "Thủy lợi") có chứa chuỗi con **"hủy"**, nên hệ thống tưởng người dùng muốn hủy xe dẫn đến việc đặt `operation = CANCEL`. Luồng Hủy xe lại bắt buộc phải có `booking_id`, làm cho hệ thống mắc kẹt và liên tục hỏi người dùng mã này.

### Kế hoạch chỉnh sửa (Fix Plan)
- **File cần sửa:** `apps/agent-service/src/agents/assistant/understanding/interpreter.py`
- **Logic sửa:** Sửa lại hàm `_operation` để kiểm tra theo từng từ độc lập (exact word / word boundary) thay vì chuỗi con. Có thể dùng biểu thức chính quy (Regex) để loại bỏ dấu câu, thêm khoảng trắng và kiểm tra `f" {value} " in padded_text`. Việc này sẽ giúp phân biệt rõ chữ "hủy" đứng độc lập với chữ "thủy" (trong thủy lợi).
- **Cập nhật kiểm thử:** Sau khi chỉnh sửa, cần viết/bổ sung test case đảm bảo các câu có từ "thủy lợi", "thủy cung"... không kích hoạt nhầm lệnh Hủy.
