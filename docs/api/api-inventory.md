# Danh Mục API Chuẩn Tắc (Canonical API Inventory)

Danh mục này được trích xuất trực tiếp từ các controller NestJS, router FastAPI, và các tệp hợp đồng OpenAPI hiện có trong kho mã nguồn. Tài liệu phản ánh chính xác các tuyến đường (route) đang tồn tại; các tính năng trên lộ trình tương lai mà chưa có controller/router tương ứng sẽ không được liệt kê là đã triển khai.

### Phân Loại Trạng Thái (Classification)
- `PUBLIC_CANONICAL`: Bề mặt API công khai chính thức dành cho ứng dụng người dùng cuối (Web / Mobile).
- `INTERNAL`: Ranh giới kiểm tra sức khỏe hoặc giao tiếp nội bộ riêng tư giữa các service.
- `LEGACY_COMPAT`: Tuyến tương thích giữ lại phục vụ các bài test hoặc bản demo cũ.
- `DEPRECATED`: Đã lỗi thời, không nằm trong runtime chính thức của X-One.

Mọi lưu lượng truy cập từ người dùng cuối đều đi qua API Gateway. Xác thực công khai của Gateway sử dụng Bearer JWT ngắn hạn (chỉ lưu trong RAM của Web) kết hợp với cookie refresh HttpOnly có cơ chế xoay vòng. Các cuộc gọi nội bộ sử dụng service token (`INTERNAL_SERVICE_TOKEN`) kèm khẳng định actor (`X-Actor-Id`).

---

## 1. API Gateway — Ranh Giới Công Khai & Vận Hành

Nguồn: `apps/api-gateway/src/modules/**`, `apps/api-gateway/src/main.ts`, và hợp đồng OpenAPI của Gateway.

| Chủ sở hữu | Phương thức | Tuyến đường (Path) | Bên gọi | Ranh giới xác thực | Phân loại | Mục đích & Lộ trình di chuyển |
| --- | --- | --- | --- | --- | --- | --- |
| Gateway | GET | `/health/live` | Compose/K8s | Không; chỉ kiểm tra tiến trình | `INTERNAL` | Giữ làm probe vận hành liveness. |
| Gateway | GET | `/health/ready` | Compose/K8s | Không; kiểm tra dependency do Gateway sở hữu | `INTERNAL` | Giữ làm probe vận hành readiness. |
| Gateway | POST | `/api/v1/auth/register` | Web/Mobile | Công khai; tạo đồng thời user, Argon2id và phiên | `PUBLIC_CANONICAL` | Xác thực thực tế Giai đoạn 1; xem `gateway-auth-v1.yaml`. |
| Gateway | POST | `/api/v1/auth/login` | Web/Mobile | Công khai; xác thực tài khoản thực tế | `PUBLIC_CANONICAL` | Có rate-limit và thông báo lỗi an toàn chống dò tài khoản. |
| Gateway | POST | `/api/v1/auth/refresh` | Web/Mobile | Cookie HttpOnly bí mật + Origin/Referer tin cậy | `PUBLIC_CANONICAL` | Xoay vòng token; phát hiện dùng lại sẽ hủy toàn bộ phiên. |
| Gateway | GET | `/api/v1/auth/me` | Web/Mobile | Bearer JWT thực tế (hoặc demo JWT trong dev/test) | `PUBLIC_CANONICAL` | Đọc thông tin danh tính an toàn. |
| Gateway | POST | `/api/v1/auth/logout`, `/logout-all` | Web/Mobile | Nhóm cookie hiện tại / bearer actor | `PUBLIC_CANONICAL` | Hủy nhóm token hiện tại hoặc toàn bộ phiên của actor. |
| Gateway | GET | `/api/v1/auth/sessions` | Web/Mobile | Bearer JWT thực tế | `PUBLIC_CANONICAL` | Liệt kê các nhóm phiên đang hoạt động của actor. |
| Gateway | DELETE | `/api/v1/auth/sessions/{sessionId}` | Web/Mobile | Bearer JWT thực tế + Origin tin cậy | `PUBLIC_CANONICAL` | Hủy một nhóm phiên cụ thể của actor. |
| Gateway | POST | `/api/v1/auth/change-password` | Web/Mobile | Bearer JWT thực tế + Origin tin cậy | `PUBLIC_CANONICAL` | Cập nhật mật khẩu Argon2id và hủy toàn bộ phiên cũ. |
| Gateway | POST | `/api/v1/auth/forgot-password`, `/reset-password` | Web/Mobile | Công khai; reset token dùng 1 lần, có hạn và lưu hash | `PUBLIC_CANONICAL` | Cơ chế đặt lại mật khẩu bảo mật. |
| Gateway | POST | `/api/v1/assistant/chat` | Web/Mobile | Bearer token; Gateway gọi Agent nội bộ | `PUBLIC_CANONICAL` | Bề mặt hội thoại AI trợ lý hợp nhất. |
| Gateway | POST | `/api/v1/assistant/actions` | Web/Mobile | Bearer token + bắt buộc `Idempotency-Key` | `PUBLIC_CANONICAL` | Bề mặt thực thi hành động trợ lý; hỗ trợ vị trí thiết bị theo request. |
| Gateway | GET, POST | `/api/v1/conversations` | Web/Mobile | Bearer token; phân vùng theo actor Core | `PUBLIC_CANONICAL` | Danh sách và tạo hội thoại do Core sở hữu. |
| Gateway | POST | `/api/v1/conversations/{conversationId}/messages` | Web/Mobile | Bearer token; actor Core | `PUBLIC_CANONICAL` | Bề mặt tương thích gửi tin nhắn; khuyến khích dùng `/assistant/chat`. |
| Gateway | GET, PATCH, DELETE | `/api/v1/conversations/{conversationId}` | Web/Mobile | Bearer token; actor Core | `PUBLIC_CANONICAL` | Đọc, đổi tên/lưu trữ hoặc xóa một hội thoại Core. |
| Gateway | POST | `/api/v1/conversations/{conversationId}/archive`, `/unarchive` | Web/Mobile | Bearer token; actor Core | `PUBLIC_CANONICAL` | Hành động vòng đời hội thoại rõ ràng. |
| Gateway | GET, PATCH | `/api/v1/users/me` | Web/Mobile | Bearer token; actor Core | `PUBLIC_CANONICAL` | Ngữ cảnh hồ sơ an toàn; không chứa thông tin nhạy cảm. |
| Gateway | GET, POST, PATCH, DELETE | `/api/v1/addresses`, `/api/v1/addresses/{id}` | Web/Mobile | Bearer token; phân vùng theo actor Core | `PUBLIC_CANONICAL` | CRUD địa chỉ đã lưu trong Core; domain chỉ nhận snapshot bất biến. |
| Gateway | POST | `/api/v1/addresses/{id}/default`, `/api/v1/addresses/resolve` | Web/Mobile | Bearer token; actor Core / adapter vị trí | `PUBLIC_CANONICAL` | Chọn địa chỉ mặc định và phân giải địa chỉ. |
| Gateway | POST | `/api/v1/location/geocode`, `/reverse-geocode`, `/route` | Web/Mobile | Bearer token; provider cấu hình hoặc fallback tất định | `PUBLIC_CANONICAL` | Adapter vị trí; không bao giờ có thẩm quyền chốt đơn. |
| Gateway | GET, POST, PATCH, DELETE | `/api/v1/healthcare/patients/**` | Web/Mobile | Bearer token; actor Gateway + khẳng định actor Healthcare | `PUBLIC_CANONICAL` | Liên kết bệnh nhân do Healthcare sở hữu; bảo toàn lịch sử khi hủy liên kết. |
| Gateway | GET | `/api/v1/services`, `/services/catalog`, `/services/{service}` | Web/Mobile | Bearer token; client domain dạng typed | `PUBLIC_CANONICAL` | Điểm vào Service Hub, duyệt dịch vụ hỗ trợ trạng thái suy giảm một phần. |
| Gateway | GET, POST, PATCH, DELETE | `/api/v1/service-actions/food/**`, `restaurant/**`, `healthcare/**`, `ride/**` | Web/Mobile | Bearer token; client typed; idempotency khi ghi | `PUBLIC_CANONICAL` | Thao tác duyệt, giỏ hàng, giữ chỗ, chọn lịch và xác nhận Ride qua Gateway. |
| Gateway | PATCH | `/api/v1/service-actions/restaurant/reservations/{reservationId}` | Web/Mobile | Bearer token + `Idempotency-Key`; kiểm tra version | `PUBLIC_CANONICAL` | Cập nhật thời gian/số lượng khách đặt bàn cùng ID sau khi xem trước bàn trống. |
| Gateway | POST | `/api/v1/services/ride/quote` | Web/Mobile | Bearer token + `Idempotency-Key`; client Ride typed | `PUBLIC_CANONICAL` | Báo giá chuyến đi theo actor; hỗ trợ tối đa 2 điểm dừng trung gian. |
| Gateway | POST | `/api/v1/service-actions/ride/prepare` | Web/Mobile | Bearer token + `Idempotency-Key` | `PUBLIC_CANONICAL` | Tạo bản ghi dự chiếu đặt chuyến ở trạng thái `AWAITING_CONFIRMATION`. |
| Gateway | POST | `/api/v1/service-actions/ride/{bookingId}/confirm` | Web/Mobile | Bearer token + `Idempotency-Key` | `PUBLIC_CANONICAL` | Thực thi xác nhận bước 2 qua Ride; trạng thái do Ride quyết định. |
| Gateway | GET | `/api/v1/rides/{bookingId}/tracking` | Web/Mobile | Bearer token; client Ride typed theo actor | `PUBLIC_CANONICAL` | Snapshot theo dõi hành trình xe (polling). |
| Gateway | GET | `/api/v1/history`, `/api/v1/history/{type}/{id}` | Web/Mobile | Bearer token; đọc từ domain theo actor | `PUBLIC_CANONICAL` | Lịch sử hợp nhất đa dịch vụ với bộ lọc, phân trang và liên kết chi tiết. |
| Gateway | POST | `/api/v1/recommendations/rank` | Web/Mobile | Bearer token; adapter xếp hạng tất định chỉ đọc | `PUBLIC_CANONICAL` | Xếp hạng V1 theo độ liên quan/vị trí/ETA/giá/đánh giá; không có tác dụng phụ. |
| Gateway | POST, GET | `/api/v1/workflows/multi-service/plan`, `/{workflowId}` | Web/Mobile | Bearer token; actor Core + idempotency cho thao tác ghi | `PUBLIC_CANONICAL` | Quản lý kế hoạch đa dịch vụ bền vững; tài nguyên domain giữ thẩm quyền. |
| Gateway | POST | `/api/v1/workflows/multi-service/{workflowId}/steps/{stepId}/activate` | Web/Mobile | Bearer token + `Idempotency-Key` | `PUBLIC_CANONICAL` | Kích hoạt báo giá Ride sau khi bước trước thành công, đọc lại điểm đến thực tế. |
| Gateway | POST | `/api/v1/confirmations/food-order` | Web/Mobile | Bearer token; bằng chứng xác nhận trong Core | `PUBLIC_CANONICAL` | Ranh giới xác nhận đơn hàng đồ ăn. |
| Gateway | POST | `/api/v1/confirmations/{confirmationId}/execute` | Web/Mobile | Bearer token, idempotency, xác nhận dùng 1 lần | `PUBLIC_CANONICAL` | Ranh giới thực thi bước cuối của Food. |
| Gateway | GET | `/api/v1/food/orders/{orderId}`, `/tracking` | Web/Mobile | Bearer token; đọc Food qua Gateway theo actor | `PUBLIC_CANONICAL` | Gateway là điểm truy cập công khai duy nhất cho Food. |
| Gateway | GET | `/api/v1/payments/{paymentId}`, `/receipt`, `/refunds` | Web/Mobile | Bearer token; đọc Core theo actor | `PUBLIC_CANONICAL` | Đọc thông tin thanh toán, biên lai và hoàn tiền trong sandbox. |
| Gateway | GET | `/internal/tools/registry-v2` | Agent service | `X-Internal-Service-Token` | `INTERNAL` | Registry công cụ có phiên bản; kiểm tra policy metadata. |
| Gateway | POST | `/api/v1/notifications`, `/unread-count`, `/{id}/read` | Web/Mobile | Bearer token; actor Core | `PUBLIC_CANONICAL` | Trung tâm thông báo bền vững do Core sở hữu. |
| Gateway | GET, POST, DELETE | `/api/v1/favorites/**` | Web/Mobile | Bearer token; actor Core | `PUBLIC_CANONICAL` | Quản lý danh sách dịch vụ yêu thích. |
| Gateway | GET, POST | `/api/v1/feedback/**` | Web/Mobile | Bearer token; actor Core | `PUBLIC_CANONICAL` | Phản hồi đánh giá sản phẩm của người dùng. |
| Gateway | GET, POST | `/api/v1/support/tickets/**` | Web/Mobile | Bearer token; actor Core | `PUBLIC_CANONICAL` | Dòng thời gian ticket hỗ trợ kỹ thuật. |
| Gateway | POST | `/api/v1/reorders/{service}/{resourceId}` | Web/Mobile | Bearer token; validate domain mới nhất | `PUBLIC_CANONICAL` | Chuẩn bị đặt lại; không tái sử dụng giá cũ hay hành động cũ. |
| Gateway | GET, PATCH, POST | `/api/v1/admin/**` | Admin Web | `AdminGuard` phía server + `Idempotency-Key` | `PUBLIC_CANONICAL` | Tổng quan quản trị, giao dịch, người dùng, ticket hỗ trợ và dataset. |

---

## 2. Agent Service — Ranh Giới Diễn Giải Riêng Tư

Nguồn: `apps/agent-service/src/api/routes.py`, `src/main.py`. Agent tuyệt đối không gọi trực tiếp domain service, database, hay provider thanh toán.

| Phương thức | Tuyến đường (Path) | Bên gọi | Ranh giới xác thực | Phân loại | Mục đích |
| --- | --- | --- | --- | --- | --- |
| GET | `/health/live` | Compose/Gateway | Không | `INTERNAL` | Probe kiểm tra liveness. |
| GET | `/health/ready` | Compose/Gateway | Không | `INTERNAL` | Probe kiểm tra readiness an toàn. |
| POST | `/api/v1/assistant-chat` | Gateway | Token nội bộ + `X-Actor-Id == user_id` | `INTERNAL` | Hợp đồng lập kế hoạch hợp nhất hiện tại. |
| POST | `/api/v1/restaurant-chat` | Gateway | Token nội bộ + ngữ cảnh actor | `INTERNAL` | Ranh giới đề xuất đặt bàn Restaurant dạng typed. |
| POST | `/api/v1/healthcare-chat` | Gateway | Token nội bộ + ngữ cảnh actor | `INTERNAL` | Ranh giới đề xuất đặt khám Healthcare dạng typed. |
| POST | `/api/v1/ride-chat` | Gateway | Token nội bộ | `INTERNAL` | Ranh giới đề xuất chuyến đi Ride dạng typed. |
| GET | `/api/v1/status` | Gateway/Ops | Token nội bộ | `INTERNAL` | Chẩn đoán an toàn; không để lộ key hay prompt. |

---

## 3. Các Domain Service — Ranh Giới REST Nội Bộ

Các tuyến đường này **không đối mặt với trình duyệt**. Gateway là bên gọi duy nhất và mỗi service độc quyền quản lý cơ sở dữ liệu của chính mình.

### Dịch Vụ Food (Cổng 8104)
- `GET /health/live`, `GET /health/ready`: Probe kiểm tra sức khỏe.
- `GET /api/v1/restaurants`, `GET /api/v1/restaurants/{id}/menu`: Danh mục quán và thực đơn.
- `GET /api/v1/food/search`: Tìm kiếm món ăn và nhà hàng.
- `POST /api/v1/carts`, `GET/PATCH/DELETE /api/v1/carts/{id}/items/**`: Quản lý giỏ hàng với `Idempotency-Key`.
- `POST/DELETE /api/v1/carts/{id}/voucher`: Áp dụng hoặc hủy voucher với `Idempotency-Key`.
- `POST /api/v1/delivery/quote`: Tính toán báo giá giao hàng.
- `POST /api/v1/orders/preview`: Xem trước đơn hàng có thẩm quyền.
- `POST /api/v1/orders`: Tạo đơn hàng chính thức kèm bằng chứng xác nhận từ Gateway và `Idempotency-Key`.
- `GET /api/v1/orders/{id}`, `/tracking`: Xem thông tin đơn và theo dõi trạng thái giao hàng.
- `POST /api/v1/orders/{id}/cancel-preview`, `/cancel`: Xem trước và thực hiện hủy đơn hàng.

### Dịch Vụ Ride (Cổng 8101)
- `GET /health/live`, `GET /health/ready`: Probe kiểm tra sức khỏe.
- `POST /v1/quotes`, `GET /v1/quotes/{id}`: Báo giá chuyến đi có thời hạn, validate sức chứa hành khách.
- `POST /v1/bookings:prepare`: Chuẩn bị đặt xe, gắn bằng chứng xác nhận bước 1.
- `POST /v1/bookings/{id}:confirm`: Xác nhận đặt xe chính thức, gắn bằng chứng xác nhận bước 2.
- `POST /v1/bookings/{id}:cancel`: Hủy chuyến đi có bằng chứng hủy và `Idempotency-Key`.
- `GET /v1/bookings/{id}`, `/tracking`: Tra cứu thông tin và tọa độ tài xế giả lập theo thời gian thực.

### Dịch Vụ Restaurant (Cổng 8102)
- `GET /health/live`, `GET /health/ready`: Probe kiểm tra sức khỏe.
- `GET /v1/restaurants`, `GET /v1/restaurants/{id}`: Tìm kiếm và xem chi tiết nhà hàng.
- `POST /v1/restaurants/{id}/availability`: Kiểm tra bàn trống, trả về snapshot có thẩm quyền trong 30 giây.
- `POST /v1/reservation-holds`, `/{id}/cancel`: Tạo hoặc giải phóng giữ chỗ bàn trước khi chốt.
- `POST /v1/reservations`, `GET /v1/reservations/{id}`: Đặt bàn chính thức kèm xác nhận từ Gateway.
- `PATCH /v1/reservations/{id}`: Cập nhật giờ/số lượng khách đặt bàn cùng ID với version tăng dần.
- `POST /v1/reservations/{id}/cancel`: Hủy đặt bàn với `Idempotency-Key`.

### Dịch Vụ Healthcare (Cổng 8103)
- `GET /health/live`, `GET /health/ready`: Probe kiểm tra sức khỏe.
- `GET /api/v1/departments`, `/facilities/{facility_source_id:path}`, `/doctors`: Tra cứu danh mục y tế.
- `POST /api/v1/slots/hold`: Giữ chỗ khung giờ khám bệnh tạm thời.
- `POST /api/v1/payment/webhook`: Webhook ghi nhận thanh toán nội bộ.
- `POST /api/v1/appointments/{id}/confirm`: Xác nhận lịch hẹn khám chính thức sau khi thanh toán.
- `POST /api/v1/appointments/{id}/cancel`: Hủy lịch khám với `Idempotency-Key`.
- `GET /api/v1/appointments/{id}`: Tra cứu chi tiết lịch hẹn khám của bệnh nhân.
