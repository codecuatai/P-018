# Kiến Trúc Giao Diện Sản Phẩm (Product UI Architecture)

Tài liệu này định nghĩa khung giao diện ứng dụng sau đăng nhập (authenticated product shell) và các mẫu không gian làm việc (workspace patterns) tái sử dụng cho ứng dụng Web. Đây là hợp đồng hiển thị (presentation contract), không phải là mô hình nghiệp vụ thứ hai: toàn bộ trạng thái đặt chỗ, thanh toán, hồ sơ và dịch vụ có thẩm quyền vẫn xuất phát từ Gateway và domain service tương ứng.

## Cấu Trúc Khung Và Không Gian Làm Việc (Shell & Workspace Geometry)

- **Thanh điều hướng bên (Navigation Rail)** trên máy tính có chiều rộng cố định 224–240px kết hợp với cột nội dung linh hoạt (fluid content column). Thanh điều hướng là dạng dính (sticky), hỗ trợ điều hướng hoàn toàn bằng bàn phím và không bao giờ tự quản lý trạng thái dịch vụ.
- **Cột nội dung** được tổ chức theo cấu trúc: `tiêu đề trang (page header) → không gian làm việc chính (primary workspace) → ngữ cảnh hỗ trợ (supporting context)`. Một trang có thể sử dụng layout một cột cho giao dịch tập trung, hoặc layout hai cột khi ngữ cảnh hỗ trợ tác động trực tiếp đến hành động tiếp theo.
- **Thanh ngữ cảnh (ContextRail)** là vùng bên phải có thể tái sử dụng, dành cho tác vụ hiện tại, snapshot dữ liệu có thẩm quyền, hành động tiếp theo và trợ giúp/phục hồi lỗi. Đây không phải là menu điều hướng trùng lặp và tuyệt đối không tự bịa ra dữ liệu không có trong phản hồi API.
- Không gian làm việc trợ lý sử dụng: `khung hội thoại chính + ContextRail`; không gian làm việc dịch vụ sử dụng: `bề mặt dịch vụ chính + ContextRail` khi có báo giá, đơn hàng, giỏ hàng, lịch khám hoặc chuyến đi đang hoạt động.

## Các Chế Độ Của ContextRail

`ContextRail` tiếp nhận chế độ rõ ràng và trạng thái dữ liệu:
- `idle`: Định hướng ngắn gọn và gợi ý một hành động hữu ích tiếp theo.
- `active`: Snapshot thực thể/giao dịch hiện tại, trạng thái và hành động kế tiếp được phép thực hiện.
- `tracking`: Trạng thái chuyến đi trực tiếp, ETA, thông tin tài xế/bản đồ, thời điểm làm mới và thông báo trạng thái kết thúc.
- `recovery`: Hiển thị trung thực trạng thái lỗi/thất bại từng phần, nút thử lại và lối thoát an toàn.

Trên tablet, ContextRail chuyển thành phần ngữ cảnh ở trên hoặc dưới tác vụ chính. Trên thiết bị di động màn hình hẹp, nó trở thành vùng thu gọn (`details`) hoặc một phần có nhãn rõ ràng; các trạng thái và hành động quan trọng luôn hiển thị mà không bắt buộc người dùng phải mở rộng.

## Cấu Trúc Thực Thể, Chi Tiết Và Giao Dịch

- **Danh sách thực thể (Entity List)**: Bộ điều khiển tìm kiếm/lọc, số lượng kết quả hoặc trạng thái phân trang con trỏ, hàng/card kết quả ổn định, và đầy đủ các trạng thái rỗng/lỗi/đang tải.
- **Chi tiết thực thể (Entity Detail)**: Hiển thị danh tính và metadata tin cậy trước tiên, vị trí/hình ảnh đã xác minh khi có sẵn, sau đó là các thông tin và hành động đặc thù của domain.
- **Giao dịch (Transaction)**: Snapshot có thẩm quyền, 2 bước xác nhận rõ ràng khi cần, trạng thái thanh toán/tác dụng phụ, biên lai và lối phục hồi. Các nút bấm chỉ bị vô hiệu hóa (disabled) khi request liên quan đang được xử lý trên mạng.
- **Trạng thái trực tiếp (Live Status)**: Nhãn trạng thái, thời gian cập nhật gần nhất, hành vi làm mới có giới hạn, trạng thái kết thúc và ghi chú thẩm quyền. Việc polling tự động dừng lại khi đạt trạng thái kết thúc và tạm dừng khi tab trình duyệt bị ẩn.

## Quy Chuẩn Trực Quan Và Tương Tác

- Sử dụng font chữ **Be Vietnam Pro** cho văn bản sản phẩm và **IBM Plex Mono** cho các nhãn phụ/trạng thái kỹ thuật. Sử dụng các token màu ngữ nghĩa sẵn có; không tùy tiện đưa gradient lòe loẹt, kính mờ (glassmorphism) hay các khối cầu trang trí vào giao diện sản phẩm sau đăng nhập.
- Ưu tiên bề mặt điềm tĩnh, viền mỏng 1px, bo góc vừa phải và duy nhất một hành động chính (primary action) cho mỗi vùng giao diện. Trạng thái bắt buộc phải được truyền tải bằng văn bản kèm màu sắc, không bao giờ dùng màu sắc đơn độc.
- Hình ảnh thực tế yêu cầu có nguồn gốc, mục đích rõ ràng, văn bản thay thế (alt) trợ năng và hình ảnh dự phòng. Hình ảnh bị thiếu hiển thị khung giữ chỗ hữu ích hoặc ẩn đi, không bao giờ bịa đặt thông tin kinh doanh.
- Bản đồ chỉ hiển thị tọa độ đã xác minh và snapshot lộ trình thực tế. Khi nhà cung cấp bản đồ không phản hồi, hệ thống chuyển sang hiển thị dữ kiện lộ trình và tọa độ dạng chữ; tuyệt đối không vẽ sơ đồ giả định.
- Chuyển động (motion) giới hạn ở việc chuyển đổi trạng thái, phản hồi tải trang và hiển thị lũy tiến. Tôn trọng tùy chọn `prefers-reduced-motion` và tránh các hiệu ứng gợi ý một sự thay đổi trạng thái trước khi API chính thức xác nhận.

## Hợp Đồng Responsive Và Trợ Năng (Accessibility)

- Chiều rộng màn hình cơ sở tối thiểu là **320px**. Bố cục không được xuất hiện thanh cuộn ngang ngoài ý muốn, và các nút bấm giữ kích thước vùng chạm chuẩn cảm ứng (tối thiểu 44x44px).
- Mọi trường nhập liệu đều có nhãn hiển thị hoặc tên trợ năng rõ ràng. Mọi nút bấm chỉ có icon đều có `aria-label`. Thứ tự focus tuân thủ theo luồng tác vụ; `aria-live` dành riêng cho việc cập nhật trạng thái động.
- Các trạng thái Đang tải (Loading), Trống (Empty), Thành công một phần (Partial), Lỗi (Error) và Thành công (Success) được thiết kế như nội dung hạng nhất. Skeleton giữ nguyên layout cuối cùng và không gợi ý dữ liệu chưa tới.
- Quy trình Visual QA kiểm tra giao diện tại các kích thước 320, 390, 768, 1024, và 1440px, cùng với kiểm tra focus bàn phím và giảm chuyển động.
