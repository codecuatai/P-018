# Kế hoạch chi tiết cải thiện luồng chăm sóc sức khỏe (bản cập nhật)

## Mục tiêu
- Nhận diện chính xác **đoạn hội thoại sức khỏe** ngay cả khi người dùng nhập thông tin phức tạp, nhiều triệu chứng, hoặc mô tả chung.
- Tự động **gợi ý khoa khám** dựa trên các triệu chứng (sử dụng LLM khi cần) và không chuyển sang miền **food**.
- Thu thập **vị trí** người dùng (danh sách địa chỉ đã lưu + nhập mới) và hiển thị **danh sách lịch khám** để người dùng chọn.
- Đảm bảo **log.json** không tạo task `food` khi có intent sức khỏe và trả lời người dùng bằng thông tin y tế phù hợp.

## Các thay đổi đề xuất

### 1. Tiền xử lý Intent & Phát hiện triệu chứng
- Thêm hàm `detect_health_keywords(text: str) -> bool` kiểm tra các từ khóa sức khỏe (`đau`, `bệnh`, `khám`, `triệu chứng`, …).
- Khi trả về `True`, đặt flag `force_healthcare=True` trong `ConversationState`.
- **Sử dụng LLM** (prompt nội bộ) để **phân tích câu nhập phức tạp** (nhiều triệu chứng, mô tả chi tiết) và trả về danh sách các triệu chứng chuẩn hoá.
- Kết quả từ LLM sẽ truyền vào slot `symptoms` dưới dạng danh sách.

### 2. Bảng ánh xạ triệu chứng → khoa (có fallback LLM)
```json
{
  "đau bụng": "Tiêu hóa",
  "đau dạ dày": "Tiêu hóa",
  "đau đầu": "Thần kinh",
  "cảm lạnh": "Nội tiết",
  "đau lưng": "Cơ xương khớp"
  // ... mở rộng
}
```
- Khi có danh sách triệu chứng, đầu tiên **tra cứu bảng** để xác định khoa.
- Nếu không khớp, **gọi LLM** với prompt: *“Dựa trên các triệu chứng sau, người bệnh nên đến khoa nào?"* và trả về khoa đề xuất.

### 3. Quản lý ưu tiên task
- Khi một task `healthcare` được tạo (hoặc flag `force_healthcare` bật), **hủy** hoặc **đánh dấu tạm hoãn** mọi task `food` đang `IN_PROGRESS`/`PLANNING`.
- Thêm trường `is_deferred` trong `Task` để lưu trạng thái tạm hoãn, tránh mất dữ liệu nếu người dùng sau này quay lại yêu cầu ăn uống.

### 4. Cập nhật flow hỏi thông tin
#### 4.1 Khi thiếu `department`
- Prompt mới: 
  > "Bạn có thể mô tả triệu chứng hiện tại (ví dụ: đau bụng, sốt, ...)? Từ đó mình sẽ gợi ý khoa phù hợp."
- Sau khi nhận được `symptoms`, **tự động** gán `department` (bảng ánh xạ hoặc LLM) và **bỏ qua** câu hỏi này nếu đã có.

#### 4.2 Khi thiếu `location`
- Hiển thị **danh sách địa chỉ đã lưu** của người dùng (API `healthcare.list_user_addresses` giả định tồn tại) dưới dạng **các mục selectable**.
- Thêm **ô nhập "Địa chỉ khác"** để người dùng nhập địa chỉ mới.
- Khi người dùng chọn một địa chỉ hoặc nhập mới, **ẩn** danh sách địa chỉ và tiếp tục với `healthcare.list_slots`.
- Prompt: 
  > "Bạn đang ở khu vực nào (thành phố, quận) để mình tìm lịch khám gần nhất? Bạn có thể chọn địa chỉ đã lưu hoặc nhập địa chỉ mới."

### 5. Trả lời hợp lý và ngăn tạo task `food`
- Khi người dùng mô tả triệu chứng, tạo **phản hồi ngay**: 
  > "Dựa trên triệu chứng `đau bụng`, bạn nên đến khoa **Tiêu hóa**. Bạn muốn đặt lịch khám tại cơ sở nào?"
- Nếu người dùng tiếp tục hỏi về món ăn, hệ thống sẽ **hỏi lại**: 
  > "Hiện tại bạn đang trong quy trình đặt khám. Nếu muốn đặt món ăn, vui lòng trả lời ‘đặt món ăn’."
- Điều này ngăn việc tạo task `food` khi chưa hoàn thành quy trình y tế.

### 6. Kiểm thử
- **Unit tests** cho `detect_health_keywords`, hàm LLM symptom extraction, và ánh xạ bảng.
- **Integration tests** mô phỏng hội thoại:
  1. Người dùng: "tôi ăn bún xong đau bụng, sốt nhẹ, muốn đi khám" → hệ thống nhận diện health, gợi ý khoa Tiêu hóa, hỏi vị trí, trả danh sách lịch.
  2. Người dùng: "đặt món ăn" khi đang trong quy trình y tế → phản hồi nhắc chuyển sang quy trình ăn.
- Kiểm tra **log.json**: không có task `food` khi có flag `force_healthcare`.

## Kế hoạch thực hiện
| Bước | Mô tả | Thời gian dự kiến | Người thực hiện |
|------|-------|-------------------|-----------------|
| 1 | Thêm `detect_health_keywords` & tích hợp vào decision node | 0.5 ngày | Backend engineer |
| 2 | Xây dựng API/LLM wrapper để trích xuất danh sách triệu chứng từ câu người dùng | 1 ngày | AI/NLP engineer |
| 3 | Tạo file `symptom_to_department.json` và logic fallback LLM | 0.5 ngày | Backend engineer |
| 4 | Thêm logic hủy/defer task `food` khi health intent được bật | 0.5 ngày | Backend engineer |
| 5 | Cập nhật prompt và flow hỏi `department` & `location` (UI selectable + nhập mới) | 1 ngày | Conversation designer & Front‑end developer |
| 6 | Viết unit & integration tests cho các hàm mới và flow mới | 1 ngày | QA engineer |
| 7 | Đánh giá logs trên môi trường staging, xác nhận không còn task `food` khi có health intent | 0.5 ngày | DevOps & QA |
| 8 | Triển khai lên production | 0.5 ngày | DevOps |

## Kiểm tra & Xác nhận
- **Kiểm thử thủ công** trên staging với các kịch bản phức tạp (nhiều triệu chứng, nhập địa chỉ mới).
- Xác nhận **log.json** không có mục `food` khi có symptom health.
- Đảm bảo **phản hồi** cho người dùng luôn là thông tin y tế (khoa, lịch, địa chỉ) và không nhầm lẫn sang món ăn.

## Các câu hỏi còn mở
> **[IMPORTANT]** Không có câu hỏi mở; toàn bộ yêu cầu đã được phản hồi và cập nhật trong kế hoạch.

*Sau khi bạn đồng ý với bản cập nhật này, mình sẽ tiến hành thực hiện các thay đổi.*

## Lấy địa chỉ từ hồ sơ khách hàng

**Mục tiêu**: Cho phép AI Agent truy cập vào thông tin hồ sơ của người dùng để lấy danh sách các địa chỉ đã lưu, từ đó gọi ý và cho phép người dùng chọn nhanh làm điểm đón, điểm đến hoặc địa điểm giao đồ ăn.

**Phương án đề xuất**:
1. **API Gateway / MCP Server**: Thêm một công cụ (tool) hoặc sửa đổi công cụ hiện tại để gọi đến API lấy thông tin người dùng (GET /api/v1/users/profile hoặc tương tự) thông qua Gateway.
2. **Cập nhật Client**: Nếu hệ thống có User/Profile service, cần đảm bảo ProfileClient trong API gateway cung cấp phương thức lấy saved_addresses.
3. **Mô tả Tool**: Cung cấp cho Agent một công cụ tên là get_user_saved_addresses để Agent có thể tra cứu khi người dùng muốn đặt xe.
4. **Luồng làm việc**: Khi người dùng yêu cầu đặt xe mà chưa cung cấp địa chỉ, Agent có thể gọi get_user_saved_addresses, lấy danh sách và hiển thị dưới dạng lựa chọn (options) cho người dùng (có thể dùng tool sk_question hoặc hiển thị nút bấm nếu UI hỗ trợ).
