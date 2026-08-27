1.YC1 

- 
Bug là gì
Hai nút trong ô chat — “Thêm tùy chọn” (dấu cộng) và “Nhập bằng giọng nói” (micro) — nhìn như nút chức năng, nhận focus/click bình thường nhưng không thực hiện bất kỳ thao tác nào: không mở menu, không xin quyền micro, không báo “chưa hỗ trợ”.

Cách nhìn thấy lỗi
Mở Trợ lý AI tại /app.

Bấm dấu cộng cạnh ô nhập; giao diện không thay đổi.

Bấm biểu tượng micro; không có xin quyền, trạng thái ghi âm hay thông báo lỗi.

Có thể bấm lặp lại nhưng không có phản hồi.

Vì sao lỗi này quan trọng
Đây là hai affordance nổi bật ngay ở luồng chính. Nút chết khiến người dùng tưởng app treo, đặc biệt người cần nhập giọng nói hoặc muốn đính kèm/tùy chọn. Nó cũng vi phạm kỳ vọng truy cập: control tương tác phải có kết quả rõ ràng.

Phân tích kỹ thuật
Trong chat-dashboard.tsx, cả hai phần tử là button type="button" có aria-label/title nhưng không có onClick, state hoặc feature-availability guard. Vì vẫn enabled, DOM và trình đọc màn hình đều công bố đây là chức năng hoạt động dù code không nối handler.

Kết quả đúng cần có
Hoặc triển khai đầy đủ menu và voice input (quyền, trạng thái recording, lỗi/timeout), hoặc ẩn/disable có nhãn “Sắp có”. Không để button enabled mà không handler; thêm interaction test xác nhận mỗi control có phản hồi quan sát được.

2.YC2 
Mục tiêu
Cho phép người dùng nói để nhập yêu cầu và nghe Agent đọc phản hồi trên mobile/desktop, với tiếng Việt là ngôn ngữ ưu tiên.

Voice input
Nút mic bắt đầu ghi sau khi được cấp quyền. UI luôn hiển thị trạng thái đang nghe, thời lượng và nút dừng/hủy. Speech-to-text tạo transcript theo thời gian thực; người dùng có thể xem, sửa và xác nhận trước khi gửi.

Xử lý rõ khi bị từ chối quyền, thiếu mic, im lặng, tiếng ồn, mất mạng, transcript rỗng hoặc provider timeout. Không tự gửi khi phát hiện khoảng lặng nếu người dùng chưa bật chế độ đó. Hủy ghi âm không tạo message hay side effect.

Voice output
Mỗi phản hồi có nút Nghe, Tạm dừng/Tiếp tục và Dừng; hỗ trợ tốc độ đọc, lựa chọn giọng nếu provider cho phép. Không autoplay mặc định. Với phản hồi streaming, không đọc lặp phần cũ. Form, URL, mã và danh sách dài cần được đọc/tóm tắt hợp lý.

Kiến trúc và riêng tư
Web/mobile chỉ gửi audio qua Gateway, không gọi thẳng provider. Gateway kiểm tra loại file, kích thước, thời lượng, quyền và rate limit trước STT/TTS. Transcript là input không tin cậy và phải qua validation/policy như text. Không log raw audio, credential, prompt hệ thống hoặc chain-of-thought. Mặc định không giữ raw audio sau xử lý khi chưa có chính sách retention.

UX và accessibility
Có fallback nhập text, keyboard/focus và aria-live phù hợp. Recording indicator và nút dừng luôn nhìn thấy ở màn nhỏ. Khi đổi tab, khóa màn hình hoặc có cuộc gọi, ghi âm phải pause/dừng an toàn. Bug nút mic hiện tại được theo dõi riêng: [BUG][P2][Chat] Nút thêm tùy chọn và nhập giọng nói không có tác dụng
TODO
.

Tiêu chí hoàn thành
Ghi âm tiếng Việt → sửa transcript → gửi Agent → nghe phản hồi hoạt động xuyên suốt. Retry không gửi lặp; audio quá dài/sai định dạng có lỗi dễ hiểu. Có test permission denied, silence, cancel, retry, streaming STT/TTS, 375px/desktop, rate limit và bảo đảm không lưu/log raw audio ngoài chính sách.