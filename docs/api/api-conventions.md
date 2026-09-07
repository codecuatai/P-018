# Quy Ước Thiết Kế API (API Conventions)

Các tuyến (route) công khai của API Gateway sử dụng tiền tố `/api/v1`; các tuyến nội bộ tùy chọn sử dụng `/internal/v1`. Các tiền tố nội bộ của từng service domain hiện được phân tách theo các lát cắt phát triển lũy tiến:

| Ranh giới | Tiền tố |
| --- | --- |
| **API Gateway Công Khai** | `/api/v1` |
| **Restaurant Service** | `/v1` |
| **Ride Service** | `/v1` |
| **Food Service** | `/api/v1` |
| **Healthcare Service** | `/api/v1` |

Đây là sự phân tách hợp đồng lũy tiến trong lịch sử phát triển; không đổi tên các tuyến đang hoạt động ổn định chỉ vì mục đích hình thức. Sử dụng định dạng JSON `snake_case`, thời gian ISO 8601 có múi giờ, và số tiền kiểu số nguyên kèm mã tiền tệ ISO (ví dụ: `{ "amount": 128000, "currency": "VND" }`). Hợp đồng Gateway Food công khai là [gateway-food-vertical-slice.yaml](../../packages/contracts/openapi/gateway-food-vertical-slice.yaml); hợp đồng nội bộ do Food sở hữu là [food-vertical-slice.yaml](../../packages/contracts/openapi/food-vertical-slice.yaml).

Thực đơn nhà hàng Food sử dụng phân trang phía server dạng `limit`/`offset`. Phản hồi thực đơn bao gồm `items`, `total`, `limit`, và `offset`; trong đó `total` là tổng số món ăn đang hoạt động của nhà hàng, không phải kích thước của trang hiện tại. Client yêu cầu các trang tiếp theo thay vì cắt mảng trên trình duyệt.

Danh mục API chuẩn tắc là [api-inventory.md](api-inventory.md). Các kiểu dữ liệu cơ sở dùng chung và envelope phản hồi tối thiểu được định nghĩa tại [shared-primitives.v1.yaml](../../packages/contracts/openapi/shared-primitives.v1.yaml).

Hợp đồng `Address` dùng chung bắt buộc có `id`, `label`, `address_text`, `latitude`, `longitude`, và `city`; `ward` và `district` là tùy chọn. Tài nguyên địa chỉ đã lưu chuẩn tắc do Gateway sở hữu tại `/api/v1/addresses`, được lưu trữ trong migration Core `010_core_personal_context.sql`. Food vẫn chấp nhận một `address_snapshot` bất biến trong các cuộc gọi quote/preview/order và validate actor trước khi sử dụng.

Khám phá nhà hàng (Restaurant discovery) duy trì các bộ lọc tường minh `location`, `cuisine_type`, và `budget_range` cho các luồng gọi typed. Tham số truy vấn bổ sung `q` là hợp đồng tìm kiếm tổng quát và thực hiện so khớp chuỗi con không phân biệt hoa thường trên tên quán, địa điểm hoặc loại ẩm thực. Truy vấn có dấu tiếng Việt sẽ phân biệt dấu; truy vấn không dấu sẽ không phân biệt dấu (ví dụ: `cha` có thể khớp với `chả`, `chảy`, `chảo`, hoặc `chay`, trong khi `chả` không khớp với `chay`).

Địa chỉ mặc định hoặc đã lưu chỉ là ngữ cảnh tái sử dụng, không phải là sự đồng ý ngầm để chọn điểm giao hàng cho Food. Quá trình thanh toán luôn xác nhận địa điểm giao hàng trước khi giải quyết nhãn địa chỉ đã lưu. Nếu `address_text` thay đổi mà không có tọa độ thay thế, Core sẽ xóa tọa độ cũ và metadata vị trí cũ thay vì áp dụng báo giá giao hàng lên một tọa độ đã lỗi thời.

Cuộc hội thoại tiêu dùng hợp nhất sử dụng `POST /api/v1/assistant/chat` và `POST /api/v1/assistant/actions`, được tài liệu hóa trong [`gateway-v1.yaml`](../../packages/contracts/openapi/gateway-v1.yaml). Phản hồi chứa `conversation_id`, lời thoại an toàn của trợ lý, các card kết quả có thẩm quyền, mô tả hành động rõ ràng và các card đã hoàn thành. Phản hồi tuyệt đối không để lộ kế hoạch Agent, yêu cầu tool thô, trạng thái workflow nội bộ hay bản ghi xác nhận. Endpoint action yêu cầu header `Idempotency-Key` (1–255 ký tự); client tái sử dụng cùng key khi retry cùng một hành động. Các hành động tài chính/chốt đơn luôn yêu cầu bước xác nhận rõ ràng. Các card giao diện phân biệt theo trường `kind` và loại bỏ các trường nội bộ như `workflow_id`, `confirmation_id`, `tool_request`, và `resource_version`. Card `ride_timing_conflict` phản ánh trung thực kết quả không thể đặt chuyến khi thời gian khởi hành phụ thuộc vào Healthcare không khả thi.

Khi cập nhật lịch đặt bàn Restaurant hiện có, Gateway sử dụng luồng update riêng: phản hồi hiển thị trước thời gian/số lượng khách cũ và mới, và chỉ trả về action `restaurant_update` sau khi đọc dữ liệu bàn trống mới nhất. Action đọc lại đơn đặt bàn của actor, kiểm tra `resource_version` hiện tại, và gọi PATCH sang Restaurant kèm idempotency key do Gateway quản lý. Domain phải trả về đúng ID đặt bàn cũ với version tăng dần; không có thao tác ghi nào xảy ra ở bước preview.

Khi một lượt giữ chỗ (hold) còn hiệu lực bị vô hiệu hóa do thay đổi số lượng khách/thời gian/nhà hàng, Gateway yêu cầu Restaurant giải phóng lượt giữ chỗ đó bằng một thao tác hủy idempotent riêng biệt trước khi tạo lượt giữ chỗ thay thế. Gateway validate các trường bắt buộc và chuẩn hóa thời gian về múi giờ `Asia/Ho_Chi_Minh` trước khi xuất định dạng ISO 8601.

`AssistantChatRequest.current_location` và `AssistantActionRequest.current_location` là ngữ cảnh giao diện tạm thời tùy chọn. Chúng chứa vĩ độ/kinh độ thiết bị đã validate, thời gian thu thập, độ chính xác tùy chọn và văn bản địa chỉ hiển thị. Web gửi lại giá trị này cùng hành động chọn/xác nhận khi báo giá Ride phụ thuộc được chuẩn bị; nó không bao giờ được ghi vào hồ sơ địa chỉ đã lưu. Thứ tự ưu tiên ngữ cảnh là tất định: giá trị rõ ràng của lượt hiện tại > ngữ cảnh giao diện hiện tại > dữ kiện hội thoại có thẩm quyền > ngữ cảnh hồ sơ đã lưu > gợi ý bộ nhớ truy xuất. Nguồn ưu tiên thấp hơn không bao giờ ghi đè nguồn ưu tiên cao hơn, và mỗi slot ngữ nghĩa đều mang thông tin nguồn gốc. Diễn giải ngày giờ sử dụng múi giờ `Asia/Ho_Chi_Minh`; thời gian đã qua trong ngày sẽ được hỏi lại để làm rõ thay vì âm thầm chuyển sang ngày mai. Báo giá Ride có tối đa 2 điểm dừng trung gian; các điểm dừng là một phần của payload báo giá/xác nhận có thẩm quyền, do đó bất kỳ thay đổi lộ trình nào cũng yêu cầu báo giá mới và bước xác nhận lại chi tiết dịch vụ.

Các lượt trò chuyện thông thường chỉ trả về lời thoại an toàn mà không replay lại card hay action cũ, trong khi trạng thái workflow đang chờ vẫn được bảo lưu cho lượt nghiệp vụ sau. Việc chuyển đổi ngữ cảnh có thể đánh dấu các tác vụ điều phối chưa hoàn thành là `DISCARDED`; đây không phải là tuyên bố rằng tài nguyên domain đã bị hủy. Các đơn đặt chỗ/hàng đang hoạt động và trạng thái tài chính vẫn bắt buộc phải đi qua workflow hủy của chính domain đó cùng chính sách xác nhận rõ ràng.

Phản hồi thành công chuẩn:
```json
{
  "data": {},
  "meta": {
    "request_id": "cor_...",
    "timestamp": "2026-08-05T16:00:00+07:00"
  }
}
```

Phản hồi lỗi theo chuẩn cảm hứng từ RFC-7807: `type`, `title`, `status`, `code`, `detail` an toàn, `retryable`, và `request_id`; tuyệt đối không bao giờ trả về stack trace mã nguồn.

Header `X-Correlation-Id` được chấp nhận hoặc tự động sinh cho mọi request. `X-Workflow-Id` và `X-Tool-Call-Id` áp dụng cho các workflow điều phối. Lệnh gọi nội bộ bắt buộc có token xác thực service (`X-Internal-Service-Token`).

## Hợp Đồng Xác Thực (Authentication Contract)

Hợp đồng xác thực Giai đoạn 1 được phiên bản hóa tại [`gateway-auth-v1.yaml`](../../packages/contracts/openapi/gateway-auth-v1.yaml). Các endpoint Đăng ký/Đăng nhập/Làm mới token trả về `{ data: { access_token, token_type, expires_in, user }, meta }`; tuyệt đối không trả về refresh token thô trong JSON. Gateway đặt refresh token trong cookie `HttpOnly`, `SameSite=Lax`, phạm vi `/api/v1/auth` (và gắn cờ `Secure` ngoài môi trường HTTP dev cục bộ). Trình duyệt chỉ lưu access token trong RAM và gọi refresh với `credentials: "include"`.

Refresh token tái sử dụng (replay) sẽ trả về lỗi an toàn `REFRESH_TOKEN_REUSED` sau khi toàn bộ nhóm phiên (token family) bị thu hồi ngay lập tức. `GET /auth/sessions` chỉ hiển thị metadata của phiên; không endpoint nào để lộ refresh token thô hoặc hash.

## An Toàn Thao Tác Ghi (Write Safety & Idempotency)

Mọi thao tác ghi có thể thử lại hoặc gây tác dụng phụ đều phải nhận `Idempotency-Key` ngay từ request đầu tiên, không phải chỉ sau khi thất bại. Domain service giới hạn phạm vi khóa theo actor đã xác thực, thao tác (operation), và khoảng thời gian lưu giữ; cùng một khóa và payload đã chuẩn hóa sẽ trả về cùng một kết quả logic, trong khi thay đổi payload sẽ bị từ chối với lỗi xung đột an toàn (`409 Conflict`). Không ghi log các payload nhạy cảm thô chỉ để phục vụ kiểm tra idempotency.

Đối với các đề xuất của Agent, `tool_call_id` là metadata trace không đáng tin cậy và không bao giờ là nguồn của khóa ghi phía hạ nguồn. Gateway tạo định danh thực thi có giới hạn từ trạng thái tác vụ đã lưu trữ theo actor, task revision, capability, và chỉ số đề xuất; validate cả hai định danh và truyền khóa do Gateway quản lý tới domain.

Kiểm tra bàn trống của Restaurant trả về `snapshot_id` và `resource_version` riêng biệt cùng `observed_at` và `expires_at` có múi giờ. TTL hiện tại là 30 giây. Phía tiêu thụ yêu cầu độ tươi mới bắt buộc phải từ chối nếu thiếu hoặc hết hạn `expires_at`.

Xác nhận tài chính không phải là một cờ boolean đơn giản. Hợp đồng ràng buộc nó với actor, hành động, payload hoặc mã băm đã chuẩn hóa, phiên bản báo giá/tài nguyên, giá/loại tiền tệ, thời hạn, thời điểm cấp phát/tiêu thụ, và bằng chứng audit dùng một lần. Khi đặt hàng Food, hệ thống yêu cầu `expected_snapshot_hash`, `expected_cart_version`, `expected_amount`, `expected_currency`, và `expected_quote_version`; Food tính toán lại báo giá dưới khóa hàng (row-lock) trước khi chèn đơn hàng mới.

## Bổ Sung Công Khai

- Quản lý hội thoại: `GET/POST /api/v1/conversations`, xem chi tiết/cập nhật/lưu trữ/xóa theo actor.
- Thông tin cá nhân: `/api/v1/users/me`, `/api/v1/addresses`, `/api/v1/location`, `/api/v1/healthcare/patients`.
- Lịch sử & Dịch vụ: `/api/v1/history`, `/api/v1/services`, theo dõi chuyến đi `/api/v1/rides/{bookingId}/tracking`.
- Xếp hạng gợi ý: `POST /api/v1/recommendations/rank` là adapter xếp hạng tất định V1 kết hợp độ liên quan, khoảng cách, ETA, giá và đánh giá; loại bỏ tọa độ mặc định đáng ngờ khỏi phép tính khoảng cách.
- Kế hoạch đa dịch vụ: `POST /api/v1/workflows/multi-service/plan` lưu trữ state machine cho các kịch bản `restaurant_ride`, `healthcare_ride`, và `food_healthcare`. Tọa độ hay địa chỉ do model tự sinh đều bị từ chối; Gateway luôn đọc lại dữ liệu có thẩm quyền từ service sở hữu. Thất bại của chuyến đi Ride không bao giờ tự động hủy lịch hẹn Healthcare đã thành công.
