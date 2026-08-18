# Phân tích dữ liệu và API của các service

> Cập nhật theo mã nguồn và migration hiện có trong `services/`.
>
> Tài liệu này tách rõ hai lớp dữ liệu:
>
> 1. **Dữ liệu nguồn/crawl đề xuất**: các bảng ở Phần I dưới đây là mẫu đầu vào, chưa phải bằng chứng rằng chúng đã tồn tại trong database runtime.
> 2. **Dữ liệu nghiệp vụ runtime đã triển khai**: các bảng ở Phần II được đối chiếu trực tiếp từ migration của từng service. Đây mới là dữ liệu có tính thẩm quyền đối với giỏ hàng, đơn hàng, giữ chỗ, đặt bàn, lịch khám và chuyến xe.
>
> Web/mobile chỉ gọi Gateway. Gateway điều phối và chuyển tiếp actor, correlation ID, confirmation evidence và idempotency key; mỗi domain service vẫn phải tự kiểm tra invariant và sở hữu database của mình.

# Phần I — Mẫu dữ liệu nguồn/crawl đề xuất

## 1. Food — cửa hàng/quán ăn (Minh)

### `food_restaurants`

| Cột             | Kiểu       | Ý nghĩa                                           |
| --------------- | ---------- | ------------------------------------------------- |
| `source_id`     | string     | ID của cửa hàng tại nguồn crawl, dùng chống trùng |
| `name`          | string     | Tên quán/cửa hàng                                 |
| `address`       | string     | Địa chỉ đầy đủ                                    |
| `ward`          | string     | Phường/xã                                         |
| `district`      | string     | Quận/huyện                                        |
| `city`          | string     | Thành phố, trước mắt là Hà Nội                    |
| `latitude`      | float      | Vĩ độ                                             |
| `longitude`     | float      | Kinh độ                                           |
| `category`      | string     | Loại cửa hàng: phở, cơm, pizza, đồ uống...        |
| `cuisine_tags`  | string[]   | Các tag ẩm thực: Việt Nam, Hàn Quốc, Nhật...      |
| `phone`         | string     | Số điện thoại nếu nguồn có                        |
| `website`       | string     | Website chính thức nếu có                         |
| `opening_hours` | JSON       | Giờ mở cửa theo từng ngày                         |
| `rating`        | float      | Điểm đánh giá nếu nguồn cho phép lấy              |
| `review_count`  | int        | Số lượng đánh giá                                 |
| `price_level`   | string/int | Phân khúc giá, ví dụ bình dân/trung bình/cao      |
| `image_url`     | string     | URL ảnh nếu được phép sử dụng                     |
| `source_name`   | string     | Nguồn dữ liệu: OSM, website...                    |
| `source_url`    | string     | URL trang nguồn                                   |
| `fetched_at`    | datetime   | Thời điểm dữ liệu được crawl                      |

### `food_menu_items`

| Cột                    | Kiểu     | Ý nghĩa                                        |
| ---------------------- | -------- | ---------------------------------------------- |
| `source_id`            | string   | ID món tại nguồn nếu có                        |
| `restaurant_source_id` | string   | Liên kết món với cửa hàng đã crawl             |
| `name`                 | string   | Tên món                                        |
| `category`             | string   | Nhóm món: món chính, đồ uống, tráng miệng...   |
| `description`          | string   | Mô tả món                                      |
| `price`                | int      | Giá món                                        |
| `currency`             | string   | Đơn vị tiền, thường `VND`                      |
| `image_url`            | string   | Ảnh món                                        |
| `available`            | bool     | Món có đang được bán theo snapshot nguồn không |
| `options`              | JSON     | Size, topping, lựa chọn thêm nếu lấy được      |
| `source_url`           | string   | Nguồn của menu/món                             |
| `fetched_at`           | datetime | Thời điểm crawl                                |

---

## 2. Restaurant — nhà hàng phục vụ đặt bàn (Tài)

### `restaurants`

| Cột             | Kiểu       | Ý nghĩa                             |
| --------------- | ---------- | ----------------------------------- |
| `source_id`     | string     | ID nhà hàng tại nguồn               |
| `name`          | string     | Tên nhà hàng                        |
| `address`       | string     | Địa chỉ đầy đủ                      |
| `ward`          | string     | Phường/xã                           |
| `district`      | string     | Quận/huyện                          |
| `city`          | string     | Thành phố                           |
| `latitude`      | float      | Vĩ độ                               |
| `longitude`     | float      | Kinh độ                             |
| `cuisine_type`  | string     | Loại ẩm thực chính                  |
| `cuisine_tags`  | string[]   | Các loại ẩm thực liên quan          |
| `description`   | string     | Mô tả nhà hàng                      |
| `phone`         | string     | Số điện thoại                       |
| `website`       | string     | Website                             |
| `opening_hours` | JSON       | Giờ hoạt động theo ngày             |
| `rating`        | float      | Điểm đánh giá nếu được phép sử dụng |
| `review_count`  | int        | Số lượt đánh giá                    |
| `price_level`   | string/int | Phân khúc giá                       |
| `image_url`     | string     | Ảnh nhà hàng nếu được phép sử dụng  |
| `source_name`   | string     | Nguồn crawl                         |
| `source_url`    | string     | Link nguồn                          |
| `fetched_at`    | datetime   | Thời điểm crawl                     |

**Không cần crawl:** số bàn, bàn trống, reservation availability. Những dữ liệu này X-One tự mô phỏng.

---

## 3. Healthcare — bệnh viện/phòng khám (Nghĩa)

### `healthcare_facilities`

| Cột                   | Kiểu     | Ý nghĩa                                   |
| --------------------- | -------- | ----------------------------------------- |
| `source_id`           | string   | ID cơ sở y tế tại nguồn                   |
| `name`                | string   | Tên bệnh viện/phòng khám                  |
| `facility_type`       | string   | `hospital`, `clinic`, `medical_center`... |
| `address`             | string   | Địa chỉ đầy đủ                            |
| `ward`                | string   | Phường/xã                                 |
| `district`            | string   | Quận/huyện                                |
| `city`                | string   | Thành phố                                 |
| `latitude`            | float    | Vĩ độ                                     |
| `longitude`           | float    | Kinh độ                                   |
| `phone`               | string   | Số điện thoại                             |
| `website`             | string   | Website chính thức                        |
| `description`         | string   | Mô tả cơ sở                               |
| `emergency_available` | bool     | Có cấp cứu hay không nếu nguồn cung cấp   |
| `opening_hours`       | JSON     | Giờ hoạt động                             |
| `image_url`           | string   | Ảnh nếu được phép dùng                    |
| `source_name`         | string   | Nguồn dữ liệu                             |
| `source_url`          | string   | Link nguồn                                |
| `fetched_at`          | datetime | Thời điểm crawl                           |

### `healthcare_departments`

| Cột                  | Kiểu     | Ý nghĩa                                      |
| -------------------- | -------- | -------------------------------------------- |
| `facility_source_id` | string   | Cơ sở y tế chứa khoa này                     |
| `name`               | string   | Tên khoa, ví dụ Khoa Nội Thần kinh           |
| `specialty`          | string   | Chuyên khoa chuẩn hóa, ví dụ `neurology`     |
| `specialty_tags`     | string[] | Các tag hỗ trợ tìm kiếm: đau đầu, đột quỵ... |
| `description`        | string   | Mô tả chức năng khoa                         |
| `source_url`         | string   | Trang chính thức chứa thông tin khoa         |

### `healthcare_doctors` — chỉ crawl nếu có nguồn chính thức đáng tin cậy

| Cột                  | Kiểu     | Ý nghĩa                                 |
| -------------------- | -------- | --------------------------------------- |
| `source_id`          | string   | ID bác sĩ tại nguồn                     |
| `facility_source_id` | string   | Bệnh viện/phòng khám bác sĩ làm việc    |
| `department`         | string   | Khoa                                    |
| `name`               | string   | Họ tên bác sĩ                           |
| `title`              | string   | BS, ThS.BS, TS.BS, PGS.TS...            |
| `specialty`          | string   | Chuyên môn                              |
| `description`        | string   | Giới thiệu/chuyên môn                   |
| `consultation_price` | int      | Giá khám nếu nguồn chính thức công khai |
| `image_url`          | string   | Ảnh bác sĩ nếu được phép                |
| `source_url`         | string   | Trang nguồn                             |
| `fetched_at`         | datetime | Thời điểm crawl                         |

**Không crawl:** slot khám, lịch trống, appointment. Những thứ này nên mô phỏng.

---

# Phần II — Database runtime và phân tích API đã triển khai

## 4. Phạm vi và quy ước chung

### 4.1. Các service được kiểm tra

| Thành phần | API prefix | Database runtime | Vai trò |
| --- | --- | --- | --- |
| `food-service` | `/api/v1` | PostgreSQL, migration riêng | Menu, cart, quote, order và giao hàng |
| `restaurant-service` | `/v1` | PostgreSQL, migration riêng | Nhà hàng, bàn, hold và reservation |
| `healthcare-service` | `/api/v1` | PostgreSQL, migration riêng | Khoa, bác sĩ, bệnh nhân, slot và appointment |
| `ride-service` | `/v1` | PostgreSQL, migration riêng | Quote, booking, confirmation và idempotency |

Các service thật đều có `/health/live` và `/health/ready`. Health endpoint chỉ cho biết tiến trình/phụ thuộc được kiểm tra, không chứng minh toàn bộ nghiệp vụ đã sẵn sàng production.

### 4.2. Nguyên tắc dữ liệu bắt buộc

- Mỗi domain service sở hữu một logical database; không query hoặc tạo foreign key xuyên service.
- Web/mobile chỉ gọi Gateway. Gateway chuyển tiếp actor, correlation ID, confirmation evidence và idempotency key; domain service vẫn tự kiểm tra invariant.
- Tiền lưu bằng số nguyên kèm currency như `VND`, không dùng số thực.
- Mọi write có thể retry phải nhận idempotency key từ request đầu. Cùng actor + operation + key + payload chuẩn hóa trả cùng kết quả logic; đổi payload phải conflict.
- Actor lấy từ assertion nội bộ, không tin `user_id` client/model tự gửi. Nếu payload có `user_id`, service phải đối chiếu actor.
- Agent chỉ phát typed tool request; domain service mới quyết định giao dịch thành công.
- Giá, tài nguyên, version hoặc điều khoản material thay đổi thì confirmation cũ vô hiệu, phải xác nhận lại.
- Availability, slot, bàn trống và booking state là dữ liệu runtime authoritative, không lấy từ crawl hoặc client cache.

### 4.3. Mapping crawl sang runtime

| Dữ liệu nguồn | Đích runtime hiện tại | Xử lý cần có |
| --- | --- | --- |
| `food_restaurants`, `food_menu_items` | `food_catalog.data`, phân loại bằng `record_type` | Job import phải validate schema, chuẩn hóa ID/giá/giờ mở cửa và tạo hash snapshot; không ghi trực tiếp cart/order |
| `restaurants` crawl | `restaurants`, `restaurant_opening_hours` | Chỉ import metadata; table/hold/reservation do Restaurant tự quản |
| `healthcare_facilities` | Chưa có bảng runtime; facility đang lấy từ config | Muốn dùng phải thiết kế migration/API, không giả định bảng mẫu đã được service đọc |
| `healthcare_departments`, `healthcare_doctors` | `departments`, `doctors` | Kiểm duyệt nguồn; không import slot/appointment |
| Dữ liệu địa điểm/tariff Ride | Hiện được mô phỏng trong domain/config | Tích hợp provider qua adapter/contract; Ride vẫn validate và sở hữu booking |

Khóa chống trùng dữ liệu crawl nên là cặp `source_name + source_id`, không chỉ `source_id`, vì hai nguồn có thể dùng cùng ID. Pipeline import nên có thêm `source_updated_at`, `content_hash`, `ingestion_status`, `last_error_code`; không trộn raw crawl với bảng giao dịch.

---

## 5. Food service

### 5.1. Database runtime

| Bảng | Dữ liệu chính | Invariant/constraint |
| --- | --- | --- |
| `food_catalog` | `restaurant`, `menu_item`, `voucher`, `address`, `driver` trong `data JSONB` | `record_type` có `CHECK`; đây là catalog runtime, không phải bảng crawl ở Phần I |
| `food_carts` | User, restaurant, cart JSON, version, payload hash, idempotency | Một cart chỉ chứa món của một restaurant; unique có điều kiện `(user_id, idempotency_key)` |
| `food_orders` | Owner, status, snapshot hash, amount/currency, workflow, driver, version | Unique `(user_id, idempotency_key)`; snapshot chống dùng giá/catalog cũ |
| `food_order_status_events` | `from_status`, `to_status`, reason, actor, metadata | Nguồn dựng timeline/audit |
| `food_voucher_redemptions` | Voucher đã dùng theo order/user | Chặn dùng lại cùng voucher cho cùng order hoặc user |
| `food_drivers` | Driver mô phỏng, available, assigned order | Assignment/release phải atomic với workflow |
| `food_order_operations` | Operation key, target, payload hash, result | Chống chạy lặp transition; cùng key khác payload/target bị từ chối |

Order có các trạng thái: `DRAFT`, `AWAITING_CONFIRMATION`, `PAYMENT_PENDING`, `PAID`, `RESTAURANT_CONFIRMING`, `RESTAURANT_ACCEPTED`, `PREPARING`, `READY_FOR_PICKUP`, `DRIVER_ASSIGNED`, `PICKED_UP`, `DELIVERING`, `DELIVERED`, `PAYMENT_FAILED`, `RESTAURANT_REJECTED`, `CANCELLED`, `REFUND_PENDING`, `REFUNDED`. Chỉ transition trong domain policy mới hợp lệ.

### 5.2. API

| Method và path | Mục đích | Kiểm tra/kết quả chính |
| --- | --- | --- |
| `GET /api/v1/restaurants` | Tìm nhà hàng | Internal auth; filter catalog |
| `GET /api/v1/restaurants/{restaurant_id}` | Chi tiết | `404 NOT_FOUND` nếu không có |
| `GET /api/v1/restaurants/{restaurant_id}/menu` | Menu | Không dùng client cache làm giá cuối |
| `GET /api/v1/menu-items/{menu_item_id}` | Chi tiết món | `404 NOT_FOUND` |
| `GET /api/v1/addresses` | Địa chỉ actor | Internal auth + actor; chỉ trả địa chỉ thuộc actor |
| `GET /api/v1/food/search` | Tìm tổng hợp | Keyword/district/category/price/open; hiện hỗ trợ chuẩn hóa dấu |
| `POST /api/v1/carts` | Tạo cart | Actor khớp `user_id`; thiếu key → `422 IDEMPOTENCY_KEY_REQUIRED` |
| `GET /api/v1/carts/{cart_id}` | Đọc cart | Kiểm tra ownership |
| `POST /api/v1/carts/{cart_id}/items` | Thêm món | Quantity `1..50`; cùng restaurant; item và option hợp lệ |
| `PATCH /api/v1/carts/{cart_id}/items/{item_id}` | Sửa món | Owner; note tối đa 500; item tồn tại |
| `DELETE /api/v1/carts/{cart_id}/items/{item_id}` | Xóa món | Owner; không tạo order side effect |
| `POST /api/v1/carts/{cart_id}/voucher` | Áp voucher | Code `1..40`; hạn dùng, restaurant, min amount, usage limit |
| `DELETE /api/v1/carts/{cart_id}/voucher` | Bỏ voucher | Cart version/snapshot thay đổi |
| `POST /api/v1/delivery/quote` | Báo phí giao | Kiểm tra restaurant/address/khoảng cách/policy |
| `POST /api/v1/orders/preview` | Preview authoritative | Re-read catalog/cart/address/voucher; trả amount, currency, versions, snapshot hash |
| `POST /api/v1/orders` | Tạo order | So sánh expected snapshot/cart/quote/amount/currency; có payment method và idempotency |
| `GET /api/v1/orders/{order_id}` | Đọc order | Actor ownership |
| `GET /api/v1/orders/{order_id}/tracking` | Timeline | Đọc từ status events |
| `POST /api/v1/orders/{order_id}/cancel-preview` | Xem khả năng hủy | Chỉ preview, chưa hủy |
| `POST /api/v1/orders/{order_id}/cancel` | Hủy | Actor, cancellation key và state policy |
| `POST /api/v1/internal/orders/{order_id}/transition` | Worker chuyển state | Internal auth, target, reason, operation key |

### 5.3. Trường hợp và cách xử lý

| Trường hợp | Xử lý tại Food | Dữ liệu/Gateway/UI |
| --- | --- | --- |
| Retry tạo cart/order do timeout | Replay theo actor + key + payload hash | Không tạo cart/order/redemption thứ hai; Gateway gửi lại đúng key/payload |
| Cùng key nhưng đổi restaurant/amount/payload | `409 IDEMPOTENCY_KEY_REUSED` hoặc `PAYLOAD_MISMATCH` | Không side effect; intent mới phải được xác nhận lại trước khi dùng key mới |
| Cart có món từ hai nhà hàng | `409 CROSS_RESTAURANT_CART` | Cart không đổi; hỏi người dùng tạo cart khác hoặc thay cart |
| Món ngừng bán sau khi xem menu | Preview/create re-read catalog; `422 MENU_ITEM_UNAVAILABLE` | Không tạo order; UI nêu món cần bỏ |
| Giá/topping/voucher/phí giao đổi sau preview | So snapshot hash, cart/quote version, amount/currency; `409 CART_CHANGED` | Tạo preview mới, hiển thị thay đổi, xin xác nhận lại |
| Thiếu option bắt buộc/chọn trùng nhóm | `422 INVALID_OPTION` | Không đổi cart/order; UI đánh dấu nhóm option |
| Restaurant đóng | `422 RESTAURANT_CLOSED` | Không tạo order; đề xuất giờ/nhà hàng khác |
| Địa chỉ ngoài bán kính | `422 DELIVERY_OUT_OF_RANGE` | Yêu cầu địa chỉ khác, không tự sửa tọa độ |
| Địa chỉ thuộc user khác | `403 FORBIDDEN` | Không lộ địa chỉ; Gateway trả thông báo an toàn |
| Voucher sai/hết hạn/không đạt min/khác restaurant | `VOUCHER_INVALID`, `VOUCHER_EXPIRED`, `VOUCHER_NOT_APPLICABLE` | Không redemption; cho bỏ/chọn voucher khác |
| Hai request đồng thời dùng voucher giới hạn | Lock/unique constraint cho một winner | Request thua `VOUCHER_USAGE_LIMIT`; refresh preview, không retry bằng key mới |
| Không còn driver | `503 UPSTREAM_UNAVAILABLE` | Không để assignment nửa chừng; worker có thể retry cùng operation key |
| Worker gửi transition lặp | Replay operation cũ; cùng key khác target/payload → conflict | Chỉ một transition/event logic |
| Hai worker tranh update | Optimistic version/locking → `409 WORKFLOW_CONFLICT` | Worker đọc lại state trước khi retry |
| Hủy ở trạng thái không cho phép | `409 ORDER_NOT_CANCELLABLE` | State giữ nguyên; client không tự đánh dấu cancelled |

### 5.4. Khoảng trống

- Food đã đối chiếu preview/snapshot/version/amount, nhưng chưa thấy bản ghi confirmation evidence độc lập, dùng một lần, bind đầy đủ actor/action/payload/quote/price/expiry như Ride. Nếu áp dụng quy tắc hai xác nhận, cần bổ sung contract và persistence; một nút UI không đủ làm bằng chứng.
- `food_catalog.data JSONB` linh hoạt nhưng khó enforce ở DB. Dữ liệu crawl cần Pydantic schema theo `record_type`, schema version và compatibility tests.
- Payment/driver hiện mang tính mô phỏng/local workflow, không nên mô tả là provider production.

---

## 6. Restaurant service

### 6.1. Database runtime

| Bảng | Dữ liệu chính | Invariant/constraint |
| --- | --- | --- |
| `restaurants` | Name, location, cuisine, budget, rating, timezone, active, description, image | Metadata authoritative hiện tại |
| `restaurant_tables` | Restaurant, table code, capacity, seating, active | Table code unique trong restaurant |
| `restaurant_opening_hours` | Weekday, open/close | Dùng tính availability theo giờ hoạt động |
| `reservation_holds` | Actor, restaurant/table, party, start/end, expiry, status, version | Hold `ACTIVE` và còn hạn mới được consume; unique legacy actor/key |
| `reservations` | Actor, restaurant/table, party/time, status, requests, hold, version | Reservation code unique; unique legacy actor/key |
| `reservation_events` | Aggregate/event, actor, correlation ID, metadata, time | Audit hold/reservation |
| `restaurant_idempotency_records` | Actor, operation, key, hash, response | Unique `(actor_id, operation, idempotency_key)` |

Hold dùng ít nhất `ACTIVE`, `CONSUMED`; hold quá hạn bị coi là invalid dù row có thể còn để audit. Reservation dùng `CONFIRMED`, `MODIFIED`, `CANCELLED`.

### 6.2. API

| Method và path | Mục đích | Kiểm tra/kết quả chính |
| --- | --- | --- |
| `GET /v1/restaurants` | Tìm kiếm | Internal auth + actor; location/cuisine/budget; `limit 1..100`, offset |
| `GET /v1/restaurants/{id}` | Chi tiết | Không có → `404` |
| `POST /v1/restaurants/{id}/availability` | Kiểm tra bàn | Party > 0; datetime có timezone và ở tương lai; duration `30..360`; seating |
| `POST /v1/reservation-holds` | Giữ bàn tạm | Actor, idempotency, availability, request hash; thành công `201` |
| `POST /v1/reservations` | Tạo reservation | Có thể consume hold; payload phải khớp; lock capacity; thành công `201` |
| `GET /v1/reservations/{id}` | Đọc reservation | Missing hoặc actor khác đều `404` |
| `PATCH /v1/reservations/{id}` | Đổi party/start/requests | Ít nhất một field; phân biệt omitted và explicit null; giữ duration khi chỉ đổi start/party |
| `POST /v1/reservations/{id}/cancel` | Hủy | Actor, state, idempotency; missing `404`, conflict `409` |

Write bắt buộc `Idempotency-Key`: thiếu/blank trả `400`; dài hơn 255 ký tự trả `422`.

### 6.3. Trường hợp và cách xử lý

| Trường hợp | Xử lý tại Restaurant | Dữ liệu/Gateway/UI |
| --- | --- | --- |
| Datetime thiếu timezone | `422 NAIVE_DATETIME` | Không tạo hold; gửi ISO-8601 có offset |
| Thời gian quá khứ | `422 PAST_START` | Không ghi booking; chọn giờ tương lai |
| Party lớn hơn capacity | Availability rỗng hoặc `CAPACITY_UNAVAILABLE` | Không tự giảm số khách; đề xuất giờ/nhà hàng khác |
| Hai actor tranh cùng bàn/khung giờ | Transaction/locking cho một winner | Request thua conflict và refresh availability |
| Hold hết hạn/khác actor | `409 HOLD_INVALID` | Không consume/không tạo reservation; tạo hold mới và xác nhận lại |
| Reservation khác party/time/table của hold | `409 HOLD_PAYLOAD_MISMATCH` | Hold không dùng cho payload khác; tạo hold mới |
| Retry cùng key/payload | Replay response đã lưu | Không tạo row/event trùng |
| Cùng key đổi payload | `409 IDEMPOTENCY_PAYLOAD_MISMATCH` | Không đổi reservation; intent mới cần key mới |
| Cùng chuỗi key khác actor/operation | Được scope riêng | Gateway vẫn sinh key entropy cao |
| PATCH rỗng | `422 NO_FIELDS_TO_UPDATE` | Không data change/event |
| Chỉ đổi start hoặc party | Giữ duration, kiểm tra lại capacity | Update atomic, tăng version/event; UI dùng response mới |
| Bỏ qua `special_requests` | Giữ giá trị cũ | Client không serialize field khi không sửa |
| Gửi `special_requests: null` | Clear có chủ đích | UI phải phân biệt không sửa và xóa |
| Actor khác đọc/sửa/hủy | Safe `404`/không cho write | Không lộ existence hoặc dữ liệu người khác |
| Retry cancel sau timeout | Replay cùng key/payload | Chỉ một cancel logic/event; conflict thì đọc lại state |

### 6.4. Khoảng trống

- Hold rồi reservation chưa biểu diễn đủ hai confirmation evidence theo invariant chung và chưa có payment quote/confirmation. Nếu không thu tiền vẫn cần mô tả rõ hai lần xác nhận bind vào payload nào.
- Crawl dùng `address/ward/district/city`, runtime dùng `location` chuỗi; phải có mapping/normalization trước import.
- Availability luôn do table, opening hours, hold và reservation runtime quyết định; Gateway không được giữ bản cache authoritative.

---

## 7. Healthcare service

### 7.1. Database runtime

| Bảng | Dữ liệu chính | Invariant/constraint |
| --- | --- | --- |
| `departments` | Tên unique, mô tả | Danh mục khoa runtime |
| `doctors` | Department, tên, giá khám nguyên, mô tả | Giá không âm; doctor thuộc một department |
| `patients` | Tên, phone, blood type, medical history | PII/medical data; không log/trả ngoài phạm vi actor |
| `time_slots` | Doctor, start/end, `AVAILABLE/HOLDING/BOOKED`, hold expiry | Nguồn lịch authoritative; khóa khi hold/confirm/cancel |
| `appointments` | Actor, patient, symptoms, doctor, slot, status, paid | `DRAFT/CONFIRMED/CANCELLED/EXPIRED`; partial unique chặn nhiều appointment active cùng slot |
| `audit_logs` | Appointment, action, timestamp, details | Audit payment/confirm/cancel/expire |
| `idempotency_records` | Key, actor, operation, request hash, response/status | Cùng payload replay; payload khác conflict |

Tên/địa chỉ facility hiện lấy từ config service, chưa lấy từ bảng `healthcare_facilities`. Vì vậy bảng crawl ở Phần I chưa tự động trở thành nguồn facility trong API.

### 7.2. API

| Method và path | Mục đích | Kiểm tra/kết quả chính |
| --- | --- | --- |
| `GET /api/v1/departments` | Danh sách khoa | Internal auth |
| `GET /api/v1/doctors?department=...` | Bác sĩ và slot trống | Department tồn tại; reconcile hold hết hạn; không có khoa → `404 DEPARTMENT_NOT_FOUND` |
| `POST /api/v1/slots/hold` | Hold slot, tạo `DRAFT` | Actor/key; `slot_id >= 1`; patient; symptoms `1..2000`; lock slot; hold 10 phút |
| `GET /api/v1/appointments/{id}` | Đọc appointment | Actor; reconcile expiry; missing/actor khác → safe `404` |
| `POST /api/v1/payment/webhook` | Ghi nhận payment mô phỏng | Key; appointment `DRAFT` còn hold; set `is_paid`, ghi audit |
| `POST /api/v1/appointments/{id}/confirm` | Confirm sau payment | DRAFT, paid, hold còn hạn; chuyển `CONFIRMED`, slot `BOOKED` |
| `POST /api/v1/appointments/{id}/cancel` | Hủy DRAFT/CONFIRMED | Nhả slot `AVAILABLE`, clear expiry, audit |

Idempotency key thiếu/blank trả `400`, quá 255 ký tự trả `422`; cùng key khác payload trả `409 IDEMPOTENCY_KEY_REUSED`.

### 7.3. Trường hợp và cách xử lý

| Trường hợp | Xử lý tại Healthcare | Dữ liệu/Gateway/UI |
| --- | --- | --- |
| Department không tồn tại | `404 DEPARTMENT_NOT_FOUND` | Không đổi DB; cho chọn lại khoa |
| Query doctor khi có hold quá hạn | Reconcile trước khi trả | Appointment → `EXPIRED`, slot → `AVAILABLE`, audit `BOOKING_EXPIRED` |
| Hai actor hold cùng slot | Row lock + unique active appointment cho một winner | Request còn lại `409 SLOT_UNAVAILABLE`; đề xuất slot khác |
| Slot/patient không tồn tại | `404` | Không tạo appointment; refresh dữ liệu |
| Actor đọc appointment người khác | Safe `404` | Không lộ PII/medical data |
| Hold quá 10 phút trước payment/confirm | Appointment `EXPIRED`, `is_paid=false`, slot `AVAILABLE` | Không confirm; tạo hold/quote mới và xác nhận lại |
| Confirm trước payment | `409 PAYMENT_REQUIRED` | DRAFT/HOLDING giữ nguyên nếu chưa hết hạn |
| Webhook payment retry | Replay idempotent | Chỉ một payment side effect/audit logic |
| Webhook đến appointment expire/cancel/confirm | Conflict/not payable | Không hồi sinh appointment; chuyển sang đối soát |
| Confirm retry sau timeout | Replay cùng key/payload | Chỉ một transition `CONFIRMED` |
| Cancel DRAFT | `CANCELLED`, nhả HOLDING slot | Slot có thể dùng lại |
| Cancel CONFIRMED | `CANCELLED`, nhả BOOKED slot, audit | Nếu có tiền thật cần refund workflow riêng |
| Cancel appointment đã expire/cancel | Conflict | State không đổi; đọc lại authoritative state |
| Cùng key dùng cho appointment/payload khác | `409 IDEMPOTENCY_KEY_REUSED` | Không tác động appointment thứ hai |
| Facility config thay đổi | Response lịch sử có thể hiển thị identity mới | Nên snapshot facility identity/version nếu là điều khoản material |

### 7.4. Khoảng trống

- `/payment/webhook` mới là acknowledgement/local simulation, chưa xác thực provider signature, event ID, amount/currency hoặc provider replay; không dùng như payment production.
- Patient/medical history là dữ liệu nhạy cảm. Cần access control, masking, retention và audit; không log raw symptoms/history.
- Hold + payment + confirm chưa có confirmation evidence độc lập bind actor/action/payload/price/expiry theo chuẩn chung.
- Nếu chuyển facility từ config sang DB, phải có migration do Healthcare sở hữu, seed deterministic, cập nhật data architecture và API contract.

---

## 8. Ride service

### 8.1. Database runtime

| Bảng | Dữ liệu chính | Invariant/constraint |
| --- | --- | --- |
| `ride_quotes` | Actor, pickup/dropoff, vehicle, distance/time, fee breakdown, discount, total, currency, tariff/quote version, expiry | Quote là snapshot có hạn; amount/currency/version phải bind vào confirmation |
| `ride_bookings` | Actor, quote/version, amount/currency, status, resource version, payment reference, driver JSON | Trạng thái: `AWAITING_PAYMENT_CONFIRMATION`, `DRIVER_ASSIGNED`, `CANCELLED` |
| `ride_confirmation_consumptions` | Confirmation ID, actor, action, payload hash, consumed time | Confirmation dùng một lần và bind vào action/payload |
| `ride_idempotency_records` | Actor, operation, key, request hash, response | Unique `(actor_id, operation, idempotency_key)` |

### 8.2. API

| Method và path | Mục đích | Kiểm tra/kết quả chính |
| --- | --- | --- |
| `POST /v1/quotes` | Tạo quote | Actor/key; pickup/dropoff `3..300`; vehicle `BIKE/CAR_4/CAR_7`; lưu breakdown/version/expiry; `201` |
| `GET /v1/quotes/{id}` | Đọc quote | Actor ownership; actor khác → `404` |
| `POST /v1/bookings:prepare` | Xác nhận dịch vụ lần một | Quote còn hạn; evidence khớp actor/action/payload/quote/amount/currency/expiry; `201` |
| `POST /v1/bookings/{id}:confirm` | Xác nhận payment lần hai | Đúng state; evidence thứ hai; payment reference; gán driver mô phỏng |
| `POST /v1/bookings/{id}:cancel` | Hủy | Evidence bind action và resource version hiện tại |
| `GET /v1/bookings/{id}` | Đọc booking | Actor ownership; actor khác → `404` |

Thiếu internal token → `401 INTERNAL_AUTH_FAILED`; thiếu actor → `400 ACTOR_REQUIRED`; thiếu key ở write → `400 IDEMPOTENCY_KEY_REQUIRED`.

### 8.3. Trường hợp và cách xử lý

| Trường hợp | Xử lý tại Ride | Dữ liệu/Gateway/UI |
| --- | --- | --- |
| Quote hết hạn trước prepare | `409 QUOTE_EXPIRED` | Không tạo booking; tạo quote mới, hiển thị giá và xin xác nhận lại |
| Evidence khác actor | `409 CONFIRMATION_MISMATCH` | Không consume/tạo booking; không sửa evidence tại Gateway |
| Evidence sai action | `409 CONFIRMATION_MISMATCH` | Tạo evidence mới đúng action sau tương tác người dùng |
| Hash/version/amount/currency đổi | `409 CONFIRMATION_MISMATCH` | Hiển thị diff material và xin xác nhận lại |
| Evidence hết hạn/timestamp sai | `409 CONFIRMATION_EXPIRED` | Không side effect; không kéo dài expiry âm thầm |
| Confirmation ID dùng lần hai | `409 CONFIRMATION_ALREADY_USED` | Không có giao dịch thứ hai; đọc kết quả request đầu |
| Retry cùng idempotency key/payload | Replay response | Không tạo quote/booking/transition trùng |
| Cùng key đổi payload | `409 IDEMPOTENCY_CONFLICT` | Không ghi thay đổi; intent mới cần confirmation/key mới |
| Confirm sai state | `409 INVALID_BOOKING_STATE` | State giữ nguyên; client đọc lại booking |
| Cancel bằng resource version cũ | Evidence/hash mismatch → conflict | Không hủy dữ liệu đã đổi; lấy bản mới và xác nhận hủy lại |
| Actor khác đọc dữ liệu | Safe `404` | Không lộ vị trí/existence |
| Hai confirm đồng thời | Transaction + idempotency + consumption cho một winner | Không gán hai driver; request thua đọc lại booking |

### 8.4. Khoảng trống

- Ride thể hiện rõ nhất quy tắc hai xác nhận và one-time evidence; có thể làm chuẩn contract cho domain khác, nhưng không chia sẻ/import business logic Ride.
- Tariff, distance, duration và driver hiện là mô phỏng. Provider thật cần adapter, timeout, provider idempotency, reconciliation và mapping lỗi; Ride vẫn sở hữu booking state.
- Có `payment_reference` chưa đồng nghĩa đã tích hợp hoặc xác minh payment thật.

---

## 9. Trường hợp xuyên service

| Trường hợp | Nơi quyết định cuối | Cách xử lý |
| --- | --- | --- |
| Thiếu token nội bộ | Mỗi service tự xác thực | `401`, không thực hiện DB write |
| Thiếu actor/actor không khớp payload | Domain service kiểm tra ownership | `400/401/403` theo contract hiện tại; không tin `user_id` từ model/client |
| Sai kiểu/range | Pydantic + domain validation | `422`, không side effect |
| Retry sau timeout | Idempotency store/constraint của domain | Gateway giữ key cũ; service replay cùng logical result |
| Cùng key nhưng đổi payload | Domain service | `409`; không cấp key mới để lách confirmation |
| Hai request tranh cùng tài nguyên | Transaction/lock/unique ở service sở hữu | Một winner; request thua conflict và refresh |
| Giá/resource version đổi sau xác nhận | Service kiểm tra quote/version/hash | Từ chối write, tạo quote/preview mới và xác nhận lại |
| Actor đọc tài nguyên người khác | Ownership check tại service | Không lộ PII; dùng safe `404` nơi contract quy định |
| Worker/provider gửi event lặp/sai thứ tự | State machine + operation idempotency | Replay hoặc conflict; không nhảy state tùy ý |
| Downstream tạm lỗi | Service bảo đảm transaction atomic | Trả lỗi retryable phù hợp; retry cùng key |
| Provider đã thu tiền nhưng response timeout | Payment adapter/domain reconciliation | Không yêu cầu trả lần hai; đối soát bằng event ID/key/reference |
| Hủy sau payment | Domain booking + payment/refund domain | Tách cancel/refund; không báo hoàn tiền trước kết quả authoritative |

### Luồng chuẩn cho booking có giá

1. Client tìm kiếm/availability qua Gateway.
2. Domain tạo preview/quote chứa `resource_version`, price, currency, expiry và normalized payload/hash.
3. Người dùng xác nhận lần một: đúng dịch vụ và chi tiết booking.
4. Gateway phát evidence bind actor + action + payload/hash + quote/resource version + price/currency + expiry.
5. Domain validate và consume evidence một lần, tạo trạng thái chờ payment.
6. Người dùng xác nhận lần hai: phương thức và số tiền.
7. Payment/domain xử lý idempotent; domain chỉ chuyển state theo kết quả authoritative.
8. Bất kỳ thay đổi material nào ở bước 2–7 làm evidence cũ vô hiệu và quay lại preview/quote.

---

## 10. Ưu tiên bổ sung dữ liệu/API

### P0 — an toàn giao dịch

- Chuẩn hóa confirmation evidence hai bước cho Food, Restaurant và Healthcare theo semantic của Ride; policy vẫn thuộc từng domain.
- Chuẩn hóa idempotency header, độ dài, error code và scope `(actor, operation, key)`.
- Agent/Gateway không xác nhận thay user; lưu one-time audit evidence và correlation ID.
- Có test cạnh tranh PostgreSQL cho voucher, bàn, healthcare slot và driver/booking.
- Payment thật phải xác thực webhook signature, provider event ID, amount/currency; có reconciliation/refund state.

### P1 — data contract

- Định nghĩa schema version cho từng `food_catalog.record_type`.
- Tạo staging/import pipeline cho crawl với provenance, hash, moderation status và unique `(source_name, source_id)`.
- Quyết định Healthcare facility là config hay entity DB; nếu là entity phải có owned migration và snapshot/version trong appointment/quote.
- Chuẩn hóa address/geo thay vì mapping mơ hồ từ các cột crawl sang `location`.
- Bổ sung OpenAPI error examples và compatibility tests cho các mã lỗi trong tài liệu.

### P2 — vận hành

- Metric cho idempotency replay/conflict, confirmation mismatch/expired/reused, capacity conflict và stale quote.
- Audit có retention/masking; không log token, raw prompt, payment credential, symptoms hay medical history không cần thiết.
- Reconciliation worker có operation key ổn định, retry/backoff và cơ chế xử lý job lỗi trước khi kết nối provider thật.

---

## 11. Checklist kiểm thử

### Food

- Cùng restaurant thành công; cross-restaurant bị chặn.
- Required option, unavailable item, closed restaurant, out-of-range bị chặn mà không tạo order.
- Catalog/voucher/giá đổi giữa preview và create làm request cũ conflict.
- Hai request voucher đồng thời chỉ một redemption.
- Retry create/cancel/transition không tạo event/side effect trùng.
- Driver release đúng và tracking dựng từ events.

### Restaurant

- Kiểm tra timezone, thời gian quá khứ, opening hours, capacity, overlap.
- Hai hold/reservation cùng bàn/thời gian chỉ một winner.
- Hold expired/khác actor/payload mismatch không được consume.
- PATCH phân biệt omitted với null và giữ duration.
- Create/update/cancel replay đúng dù state đã đổi sau response đầu.

### Healthcare

- Hai actor hold cùng slot chỉ một winner.
- Expiry chuyển appointment `EXPIRED`, nhả slot, ghi audit.
- Không confirm khi chưa paid; webhook/confirm retry không nhân đôi transition.
- Actor khác không đọc/cancel.
- Cancel DRAFT/CONFIRMED nhả slot và slot tái sử dụng được.

### Ride

- Quote expired bị từ chối.
- Evidence sai actor/action/hash/version/amount/currency/expiry bị từ chối.
- Confirmation ID chỉ consume một lần; hai bước dùng hai action/evidence riêng.
- Cancel với resource version cũ conflict.
- Retry prepare/confirm/cancel không nhân đôi booking/transition.

---

## 12. Nguồn đối chiếu trong repository

- Food: `services/food-service/src/api/food.py`, `src/application/food_service.py`, `src/domain/policies.py`, `src/domain/quotes.py`, `src/repositories/food.py`, `src/main.py`, `migrations/*.sql`, `tests/`.
- Restaurant: `services/restaurant-service/src/api/v1/restaurants.py`, `src/api/v1/reservations.py`, `src/api/auth.py`, `src/api/idempotency.py`, `src/repositories/restaurant_repository.py`, `migrations/*.sql`, `tests/`.
- Healthcare: `services/healthcare-service/src/api/`, `src/application/`, `src/repositories/`, `migrations/*.sql`, `tests/`.
- Ride: `services/ride-service/src/api/`, `src/application/`, `src/domain/`, `src/repositories/`, `migrations/*.sql`, `tests/`.

Các mục “khoảng trống” là đánh giá so với invariant kiến trúc repository, không phải tuyên bố các tính năng đó đã được triển khai.
