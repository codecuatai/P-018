# Đặc Tả Registry Công Cụ V2 (Tool Registry v2 Specification)

Trạng thái: `IMPLEMENTED_RUNTIME`. API Gateway công khai registry đã validate tại endpoint `GET /internal/tools/registry-v2`; tệp danh mục chuẩn tắc dạng JSON là [`packages/contracts/tools/tool-registry-v2.json`](../../packages/contracts/tools/tool-registry-v2.json). Agent chỉ phát ra các đề xuất dạng typed và tuân thủ policy có giới hạn; tuyệt đối không gọi trực tiếp domain, database, nhà cung cấp thanh toán hay tạo tác dụng phụ cuối cùng.

## Quy Tắc Hợp Đồng & Thẩm Quyền (Contract & Authority Rules)

Mỗi mục trong danh mục bao gồm: `name`, `domain`, `version`, `risk`, `argument_schema`, `result_schema`, `idempotency_requirement`, `confirmation_requirement`, `owner`, và `classification`. `ToolRequest` sử dụng `tool_name`; tệp JSON sử dụng `name` để có thể mô tả cả bảng ánh xạ bí danh chuẩn tắc (canonical alias mapping).

Các mức độ rủi ro được phép: `READ`, `REVERSIBLE_WRITE`, và `FINANCIAL_OR_FINAL`. Mọi thao tác ghi, giữ chỗ, hủy bỏ, xác nhận thanh toán hoặc hành động cuối cùng đều bắt buộc phải có khóa idempotency do domain kiểm soát ngay từ request ghi đầu tiên. Các thao tác tài chính/hành động cuối yêu cầu `explicit_gateway_confirmation`. Registry tự động từ chối các đối số không xác định và các dữ liệu do mô hình LLM tự bịa ra như ID thẩm quyền, giá cả, tính sẵn sàng, tọa độ, trạng thái thanh toán hay tuyên bố thành công. Hoàn toàn không có công cụ SQL/database và không có công cụ thực thi lệnh chung chung (generic executor).

## Danh Mục Hiện Tại

Tệp v2 chứa **47 mục chuẩn tắc** trên cả 4 domain sản phẩm:

| Domain | `IMPLEMENTED_AGENT_TOOL` | `IMPLEMENTED_GATEWAY_ACTION` | `IMPLEMENTED_DOMAIN_API` | Tổng số |
| --- | ---: | ---: | ---: | ---: |
| **Food** | 14 | 1 | 3 | 18 |
| **Ride** | 1 | 8 | 1 | 10 |
| **Restaurant** | 4 | 3 | 2 | 9 |
| **Healthcare** | 4 | 1 | 5 | 10 |
| **Tổng cộng** | **23** | **13** | **11** | **47** |

### Giải Thích Phân Loại:
- `IMPLEMENTED_AGENT_TOOL`: Policy của Agent có thể đề xuất công cụ chuẩn tắc này và Gateway có luồng xử lý/chuyển tiếp domain có giới hạn.
- `IMPLEMENTED_GATEWAY_ACTION`: Gateway có đường dẫn action hoặc xác nhận dạng typed, nhưng Agent không thực thi thao tác cuối như một công cụ độc lập.
- `IMPLEMENTED_DOMAIN_API`: Tuyến đường và schema của service sở hữu đã sẵn sàng; hiện chưa phải là bề mặt hành động của Agent.
- `LEGACY_COMPAT`: Tên bí danh hoặc tuyến cũ được giữ lại trong quá trình các bên gọi chuyển đổi.
- `DEPRECATED`: Đã lỗi thời, không nằm trong runtime và không phải là bí danh có thể thực thi.

### Danh Sách Tên Công Cụ Chuẩn Tắc Theo Domain

| Domain | Tên công cụ chuẩn tắc (Canonical names) |
| --- | --- |
| **Food** | `food.search`, `food.get_restaurant`, `food.list_menu`, `food.get_menu_item`, `food.create_cart`, `food.add_cart_item`, `food.update_cart_item`, `food.remove_cart_item`, `food.quote_delivery`, `food.apply_voucher`, `food.remove_voucher`, `food.preview_order`, `food.prepare_order`, `food.get_order`, `food.list_orders`, `food.track_order`, `food.prepare_cancel_order`, `food.cancel_order` |
| **Ride** | `ride.quote.create`, `ride.quote.get`, `ride.booking.prepare`, `ride.booking.confirm`, `ride.booking.get`, `ride.booking.list`, `ride.booking.status.get`, `ride.tracking.get`, `ride.booking.cancel.prepare`, `ride.booking.cancel` |
| **Restaurant** | `restaurant.search`, `restaurant.get`, `restaurant.check_availability`, `restaurant.create_hold`, `restaurant.create_reservation`, `restaurant.update_reservation`, `restaurant.get_reservation`, `restaurant.list_reservations`, `restaurant.cancel_reservation` |
| **Healthcare** | `healthcare.search_facilities`, `healthcare.get_facility`, `healthcare.list_departments`, `healthcare.list_doctors`, `healthcare.list_slots`, `healthcare.hold_slot`, `healthcare.get_appointment`, `healthcare.list_appointments`, `healthcare.confirm_appointment`, `healthcare.cancel_appointment` |

Các tên cũ của Food như `view_menu`, `view_menu_item`, `create_cart`, `add_to_cart`, `preview_order`, và `track_food_order` là các đầu vào tương thích được ánh xạ sang định nghĩa chuẩn tắc. Chúng không phải là các thẩm quyền bổ sung và tuyệt đối không được đưa vào prompt mô hình mới. Cổng kiểm tra tính tương đồng (parity gate) xác minh cả hai chiều: mọi mục trong JSON đều phải có metadata runtime khớp nhau, và mọi mục chỉ có ở runtime phải nằm trong `TOOL_REGISTRY_COMPATIBILITY` với chủ sở hữu `gateway-tools` cùng thời hạn `2026-12-31`.

## Bằng Chứng Đối Với Dịch Vụ Ride

- `ride.quote.create` có thể được đề xuất bởi Agent và thực thi qua `RideConversationService`/`RideClient`; domain Ride giữ thẩm quyền đối với biểu phí, snapshot lộ trình, các điểm dừng có giới hạn, thời hạn hết hạn và phiên bản báo giá. Thay đổi điểm dừng sẽ sinh ra báo giá mới chứ không cập nhật chuyến cũ.
- `ride.booking.prepare` và `ride.booking.confirm` là các action của Gateway với 2 bước xác nhận rõ ràng. Kết quả cuối cùng phản ánh trạng thái đặt xe của Ride (bao gồm cả `NO_DRIVER`), không tự ý suy diễn thành công.
- `ride.tracking.get`, trạng thái/danh sách booking, và hủy chuyến được biểu diễn như các khả năng của Gateway/domain với yêu cầu phạm vi actor và tính idempotent trong danh mục chuẩn tắc.

## Các Bất Biến Ranh Giới

- Gateway sở hữu ranh giới action/xác nhận công khai; một đề xuất cuối cùng không thể gọi trực tiếp endpoint hoàn tất của domain.
- Các domain service tự validate lại và sở hữu độc quyền ID, giá cả, tính khả dụng, chuyển đổi trạng thái, tính idempotent và trạng thái kết quả.
- Nội dung từ Agent và kết quả công cụ luôn bị coi là untrusted cho đến khi vượt qua schema validation, kiểm tra chính sách và domain validation. Prompt thô, payload nhà cung cấp và suy nghĩ ẩn (chain-of-thought) không bao giờ được xuất hiện trong phản hồi công khai.
- API xếp hạng và kế hoạch đa dịch vụ là các bề mặt điều phối của Gateway, không phải là công cụ của Agent. Chúng nhận dữ liệu đầu vào đã validate theo actor và kết quả domain dạng typed; Agent không thể tự chọn điểm đến, tự chốt đơn đặt hay tự đánh dấu workflow thành công.

Bằng chứng kiểm thử: `apps/api-gateway/test/tools/tool-registry.spec.ts` và `apps/agent-service/tests/test_agents/test_tool_registry_parity.py`.
