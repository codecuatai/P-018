# Hệ Thống Thiết Kế X-One (Design System)

Tài liệu này là chuẩn mực trực quan chính thức cho trang landing page, giao diện xác thực, khung sản phẩm (product shell) và các bề mặt dịch vụ của X-One.

## Định Hướng Thiết Kế (Design Direction)

**Calm Kinetic Concierge** (Người trợ lý năng động, điềm tĩnh) mang tính chất: điềm đạm, đĩnh đạc, năng lực cao, chuẩn xác, gần gũi và đáng tin cậy.

Trang landing page Giai đoạn 1 phát triển định hướng này thành một ấn phẩm sản phẩm điện ảnh (cinematic product editorial): bối cảnh rõ ràng, phương tiện truyền thông sản phẩm thực tế, thứ tự đọc mạch lạc và độ sâu trường ảnh được kiểm soát. Giao diện đem lại cảm giác X-One đang âm thầm kết nối mọi việc một cách thông suốt, không phải là một dashboard AI thông thường hay bản demo công nghệ nặng tính trang trí.

Giao lộ 4 hướng đặc trưng của X-One đóng vai trò là dấu ấn cấu trúc khi cần diễn giải cơ chế điều phối, không phải là vật trang trí mặc định ở hero. Các bề mặt landing ưu tiên video thực tế về Hà Nội, khung nhập liệu trợ lý (composer) và câu chuyện kết nối đa dịch vụ.

## Bảng Token Màu Sắc & Kiểu Chữ (Colour & Type Tokens)

Định nghĩa token chuẩn tắc duy nhất nằm trong `apps/web/src/app/globals.css`. CSS của marketing và sản phẩm bắt buộc phải dùng các tên biến ngữ nghĩa này thay vì rải các mã màu hex ngẫu nhiên:

| Token | Giá trị Hex | Vai trò |
| --- | --- | --- |
| `--color-canvas` | `#F5F7F8` | Nền canvas sứ dùng chung |
| `--color-surface` | `#FFFFFF` | Bề mặt giấy / card màu trắng |
| `--color-ink` | `#111827` | Màu văn bản chính |
| `--color-muted` | `#667085` | Màu văn bản phụ / mô tả |
| `--color-navy` | `#16324F` | Màu tối cấu trúc và tiêu đề chính |
| `--color-primary` | `#315EF5` | Hành động chính và tuyến đường đang kích hoạt (Cobalt) |
| `--color-success` | `#0E8E83` | Trạng thái đã kết nối / xác nhận thành công (Teal) |
| `--color-border` | `#D9E0E7` | Đường viền ngăn cách thanh mảnh, tinh tế |
| `--surface-ice` | `#F1F4FF` | Không khí bề mặt khu vực Dịch vụ hỗ trợ |
| `--surface-sand` | `#F7F2EC` | Không khí bề mặt khu vực Câu chuyện đa dịch vụ |
| `--surface-mist` | `#EEF8F6` | Không khí bề mặt khu vực Bản đồ / An toàn |
| `--surface-slate` | `#F1F5F8` | Không khí bề mặt khu vực Trợ lý AI |

Màu nhấn riêng của từng domain gắn liền với hình ảnh dịch vụ cục bộ: hổ phách dịu cho Food, xanh cobalt cho Ride, đỏ mọng (berry) trầm cho Restaurant và xanh mòng két (teal) cho Healthcare. Chúng không bao giờ được dùng để lấp đầy toàn bộ section hoặc làm tín hiệu trạng thái duy nhất.

Sử dụng phông chữ **Be Vietnam Pro** cho tiêu đề và nội dung thông thường, với chiều cao dòng văn bản thân từ 1.5–1.7. Sử dụng **IBM Plex Mono** chỉ cho các nhãn trạng thái kỹ thuật nhỏ, mốc thời gian hoặc nhãn tiện ích. Phông chữ Inter không phải là phông chữ định hướng cho sản phẩm này.

## Bố Cục Trang Landing (Landing Composition)

Trang landing page tuân thủ nhịp điệu sắc thái sau:

| Phân cảnh | Bề mặt nền |
| --- | --- |
| **Hero** | Màu trắng kèm video phong cảnh Hà Nội |
| **Dịch vụ hỗ trợ (Supported Services)** | Ice Cobalt |
| **Cách thức hoạt động (How X-One Works)** | Màu trắng |
| **Câu chuyện đa dịch vụ (Multi-service Story)** | Warm Sand (Cát ấm) |
| **Bản đồ lộ trình (Map)** | Mist Teal (Sương mờ) |
| **An toàn & Bảo mật (Safety)** | Nền trắng với bảng Mist Teal |
| **Trợ lý (Assistant)** | Cool Slate |
| **Kêu gọi hành động cuối (Final CTA)** | Cool Slate, cảnh sáng phong cách biên tập |
| **Chân trang (Footer)** | Dải pháp lý tối giản tích hợp liền mạch vào cảnh cuối |

Header marketing được cố định nổi phía trên hero bên trong một khung vị trí trong suốt chứa hai "đảo nổi" (floating islands) độc lập: đảo thương hiệu vừa vặn nội dung nằm ở mép trái và đảo điều hướng/hành động nằm ở mép phải. Khi cuộn trang, cả hai đảo chỉ tăng nhẹ độ đục và nâng nhẹ bóng mà không đổi hình dạng.

Hero bắt đầu nội dung chính khoảng 28–44px bên dưới header. Không có nhãn kicker thừa phía trên tiêu đề. Video bao phủ toàn màn hình kiểu điện ảnh, trong khi tiêu đề và khung soạn thảo trợ lý vẫn là các đối tượng dễ đọc nhất. Trên desktop, tiêu đề chính được ngắt thành hai dòng đầy chủ ý:

```text
Một yêu cầu.
Nhiều việc được kết nối.
```

## Hợp Đồng Phương Tiện Truyền Thông (Media Contract)

Các tài nguyên công khai tùy chọn nằm tại `apps/web/public/media/`:

| Mục đích | Đường dẫn dự kiến | Phương án dự phòng (Fallback) |
| --- | --- | --- |
| Video nền Hero | `/media/hero-loop.mp4` | Ảnh poster hero hoặc lớp media trung tính |
| Poster Hero / Khung hình giảm chuyển động | `/media/hero-poster.webp` | Lớp nền sứ trung tính |
| Hình ảnh dịch vụ — Đồ ăn (Food) | `/media/services/food.webp` | Khung ảnh bảo lưu kèm nhãn điềm đạm |
| Hình ảnh dịch vụ — Di chuyển (Ride) | `/media/services/ride.webp` | Khung ảnh bảo lưu kèm nhãn điềm đạm |
| Hình ảnh dịch vụ — Nhà hàng (Restaurant) | `/media/services/restaurant.webp` | Khung ảnh bảo lưu kèm nhãn điềm đạm |
| Hình ảnh dịch vụ — Y tế (Healthcare) | `/media/services/healthcare.webp` | Khung ảnh bảo lưu kèm nhãn điềm đạm |
| Bản đồ minh họa Hà Nội | `/media/hanoi-map.webp` | Khung hiển thị bản đồ trung tính |
| Chụp màn hình đa dịch vụ | `/media/xone-multiservice-example.webp` | Câu chuyện kết nối dẫn dắt bằng văn bản |
| Chụp màn hình chat trợ lý | `/media/xone-chat-example.webp` | Bảng sản phẩm trung tính trau chuốt |
| Chụp màn hình bước xác nhận | `/media/xone-confirmation-example.webp` | Bảng sản phẩm trung tính trau chuốt |
| Đối tượng biên tập cuối cùng | `/media/final/xone-object.webp` | Bố cục đối tượng tối giản dự phòng |

## Khoảng Cách, Hình Khối & Độ Nổi (Spacing, Shape & Elevation)

- Sử dụng thang đo khoảng cách cơ sở **4px**. Các khoảng cách phổ biến: 8, 12, 16, 24, 32, 48 và 64px.
- Các section landing sử dụng khoảng cách đệm `clamp(54px, 6vw, 88px)`. Trên mobile, khoảng cách thường nằm trong khoảng 48–64px.
- Bán kính bo góc: **8px** cho các bề mặt nhỏ phi hành động, **12px** cho ô nhập liệu/card/biểu mẫu, **16px** cho các bảng lớn, và **999px** (dạng con nhộng - pill) cho nút hành động, mũi tên carousel, bộ chọn dịch vụ và nút chuyển giai đoạn.
- Đường viền nhẹ nhưng nhìn thấy rõ; không dùng kính mờ độ tương phản kém để thay thế cho việc nhóm khối. Đổ bóng ngắn, mềm mại và thưa thớt—tuyệt đối không dùng hiệu ứng hào quang phát sáng có màu.
- Icon lấy từ thư viện Lucide, kích thước 16–20px trong nút bấm điều khiển và 20–24px trong ngữ cảnh dịch vụ.

## Trợ Năng & Giới Hạn Nội Dung

- Xây dựng đáp ứng từ kích thước 320px trở lên; không để xuất hiện tràn ngang và có liên kết bỏ qua đầu trang (skip link).
- Bản đồ được dán nhãn rõ ràng là hình ảnh minh họa marketing, không phải là định vị/theo dõi trực tiếp.
- Trợ lý AI có thể chuẩn bị lựa chọn nhưng không được tuyên bố đơn/thanh toán đã hoàn tất khi chưa có kết quả xác nhận từ Gateway.
- Khi bật chế độ `prefers-reduced-motion`, hệ thống hiển thị ảnh poster hero, ngừng xoay vòng gợi ý prompt và loại bỏ hiệu ứng biến đổi chuyển động trong khi vẫn giữ nguyên vẹn toàn bộ khối nội dung.

## Các Mẫu Phản Thiết Kế Bị Cấm (Anti-patterns)

Nghiêm cấm:
- Sử dụng gradient màu tím/xanh AI sáo rỗng.
- Nền dạng lưới (mesh background), các khối cầu phát sáng lòe loẹt, biểu tượng robot hoạt hình chung chung.
- Hiệu ứng kính mờ (glassmorphism) quá đà.
- Các mẫu dashboard SaaS mẫu sẵn với số liệu giả tạo, logo đối tác giả.
- Văn bản kích thước khổng lồ thiếu cân đối, các nút dạng pill không có ý nghĩa hành động.
- Sơ đồ mạng lưới dịch vụ trang trí rối mắt, bản đồ SVG giả tạo.
- Dải CTA tối sầm đột ngột ở cuối trang.
- Sử dụng thuộc tính `transition: all`.

Sự trong sáng, điềm tĩnh và rõ ràng luôn mang lại bản sắc đẳng cấp hơn những ồn ào thị giác thừa thãi.
