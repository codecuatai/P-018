# Ranh Giới Dịch Vụ & Thẩm Quyền Nghiệp Vụ (Service Boundaries)

Tài liệu này xác định bản đồ phân chia trách nhiệm và ranh giới quyền hạn bất biến giữa các phân hệ trong hệ thống **X-One**. Mọi thành viên và AI Agent khi phát triển đều phải tuân thủ nghiêm ngặt các ranh giới này.

---

### Bảng Phân Định Trách Nhiệm Dịch Vụ

| Dịch Vụ | Quyền Sở Hữu (Owns) | Đối Tượng Phục Vụ | Điều Tuyệt Đối Cấm (Must Not Do) |
| :--- | :--- | :--- | :--- |
| **API Gateway** | Điểm tiếp xúc công khai (Public edge), điều phối workflow đa dịch vụ, quản lý xác nhận (Confirmation), Sandbox thanh toán, định danh người dùng (Core identity), phiên đăng nhập (JWT Auth), nhật ký kiểm toán (Audit logs) và bằng chứng Idempotency. | Web, Mobile; quản lý các typed client nội bộ. | **Cấm** truy vấn trực tiếp CSDL của các domain service; **Cấm** nhúng logic nghiệp vụ đặc thù của domain vào Gateway. |
| **AI Agent** | Phân loại ý định (Intent), trích xuất thông tin (Slot filling), sinh đề xuất kế hoạch (Bounded plan/tool proposals), tạo phản hồi ngôn ngữ tự nhiên an toàn. | Chỉ phục vụ duy nhất API Gateway. | **Cấm** gọi trực tiếp các domain service; **Cấm** tự ý kích hoạt thanh toán hoặc xác nhận; **Cấm** tự bịa đặt giá cả hoặc tình trạng phòng/bàn. |
| **Ride Service** | Tình trạng khả dụng của xe, tính toán báo giá lộ trình/điểm dừng, giữ chỗ tạm thời (Holds), mô phỏng vòng đời cuốc xe và sự kiện di chuyển. | API Gateway. | **Cấm** truy cập CSDL của các dịch vụ khác; **Cấm** tự ý quyết định danh tính tài khoản người dùng ngoài phạm vi token xác thực. |
| **Restaurant Service**| Khám phá nhà hàng theo khu vực/ẩm thực, danh mục bàn ăn, giữ chỗ và quản lý vòng đời đặt bàn (Dine-in table reservations). | API Gateway. | **Cấm** quản lý đơn giao đồ ăn hoặc thực đơn giao hàng (thuộc về Food Service). |
| **Healthcare Service**| Lịch trực bác sĩ, chuyên khoa bệnh viện, tra cứu tình trạng slot khám, giữ chỗ và xác nhận lịch hẹn y tế. | API Gateway. | **Cấm** truy cập trực tiếp dữ liệu thanh toán hoặc bảng dữ liệu người dùng Core. |
| **Food Service** | Danh sách nhà hàng đối tác, thực đơn (Menus), món ăn (Items), báo giá đơn hàng, giỏ hàng (Carts), đơn đặt món (Orders) và sự kiện giao hàng. | API Gateway. | **Cấm** quản lý đặt bàn dine-in (thuộc về Restaurant Service). |

---

### Các Nguyên Tắc Ranh Giới Quan Trọng

#### 1. Phân biệt rõ ràng giữa Restaurant Service và Food Service
- **Restaurant Service**: Chuyên trách đặt bàn ăn tại chỗ (Dine-in).
- **Food Service**: Chuyên trách thực đơn món ăn, giỏ hàng và giao đồ ăn tận nơi (Food Delivery).
- **Không có bất kỳ đơn hàng hay đặt chỗ nào thuộc sở hữu của cả hai dịch vụ**. Hai dịch vụ này có CSDL logic riêng biệt (`xone_restaurant` và `xone_food`).

#### 2. Quyền sở hữu danh tính & Địa chỉ (Core vs Domain)
- **Core (Gateway)**: Nắm giữ định danh tài khoản, thông tin xác thực, hồ sơ cá nhân và sổ địa chỉ đã lưu của người dùng.
- **Domain Services (Food/Ride)**: Khi người dùng đặt món hoặc đặt xe, Gateway sẽ gửi thông tin địa chỉ dưới dạng **snapshot bất biến (Immutable transaction snapshot)**. Các Domain Service lưu trữ snapshot này vào đơn hàng của mình và không bao giờ được phép query ngược lại bảng `saved_addresses` của Core.

#### 3. Báo giá lộ trình và Điểm dừng của Ride Service
- Ride Service là đơn vị **duy nhất** có thẩm quyền tính toán giá cước, phụ phí và thời hạn hiệu lực của báo giá (Quote).
- Gateway có thể tổng hợp chuỗi tọa độ (từ điểm đón $\rightarrow$ điểm dừng trung gian $\rightarrow$ điểm đến), nhưng không được phép tự tính toán giá tiền.
- Bất kỳ sự thay đổi nào về điểm đón, điểm trả hoặc điểm dừng trước khi xác nhận đều làm vô hiệu hóa báo giá cũ và sinh ra một báo giá mới kèm yêu cầu xác nhận lại từ người dùng.

#### 4. Thẩm quyền của AI Agent
- Agent chỉ phát sinh các đề xuất công cụ có định kiểu (Typed Tool Proposals). 
- Gateway tiếp nhận kế hoạch từ Agent, kiểm tra chính sách an toàn, thực thi thông qua In-process Typed Dispatcher và định hình phản hồi cho người dùng.
- Khi người dùng hỏi chuỗi dịch vụ (ví dụ: *"Tìm quán lẩu ở Cầu Giấy rồi đặt xe đến đó"*), Gateway sẽ gọi Restaurant Service trước để lấy địa chỉ chính xác của nhà hàng đã chọn, sau đó mới dùng địa chỉ đó làm điểm đến cho yêu cầu đặt xe tiếp theo.
