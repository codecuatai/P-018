# Hợp Đồng Công Cụ (Tool Contracts)

Công cụ (Tool) là một khả năng nghiệp vụ được quản trị chặt chẽ của domain, không phải là một REST endpoint thô. API Gateway sở hữu registry và ranh giới thực thi công khai. Hợp đồng Agent mục tiêu là yêu cầu theo JSON-schema có phiên bản được định nghĩa tại [`tool-registry-v2.json`](../../packages/contracts/tools/tool-registry-v2.json). Bộ lập kế hoạch hợp nhất (Unified Planner) chỉ phát ra các đề xuất ngữ nghĩa có giới hạn. Các luồng tương thích cũ của Food và workflow dọc vẫn yêu cầu Gateway thực thi các yêu cầu read/draft/preview nằm trong allowlist; tuyệt đối không gọi trực tiếp domain hay tự ý chốt hành động cuối cùng.

Danh mục chuẩn tắc bao gồm 47 mục với các phân loại rõ ràng: `IMPLEMENTED_AGENT_TOOL`, `IMPLEMENTED_GATEWAY_ACTION`, `IMPLEMENTED_DOMAIN_API`, `LEGACY_COMPAT`, và `DEPRECATED`. Các bài kiểm thử tương đồng tại Gateway và Agent xác minh các mục chuẩn tắc và tên chính sách được kiểm soát.

## Phân Cấp Mức Độ Rủi Ro (Risk Levels)

| Mức độ rủi ro | Hành vi ví dụ | Yêu cầu xác nhận (Confirmation) |
| --- | --- | --- |
| `READ` | Tìm kiếm, xem chi tiết, kiểm tra bàn/chuyến trống, theo dõi đơn | Không yêu cầu xác nhận |
| `REVERSIBLE_WRITE` | Cập nhật giỏ hàng, giữ chỗ (hold), hủy đặt bàn | Tùy theo chính sách; bắt buộc đảm bảo tính idempotent của domain |
| `FINANCIAL_OR_FINAL` | Xác nhận đơn hàng/đặt xe/lịch khám hoặc thanh toán tiền | **Bắt buộc** có bước xác nhận rõ ràng tại Gateway |

Cấu trúc `ToolRequest` chuẩn tắc bắt buộc có: `tool_name`, `risk_level`, `arguments`, `workflow_id`, `tool_call_id`, và `schema_version`. Các yêu cầu có khả năng ghi nhận khóa idempotency từ ranh giới thực thi của Gateway, tuyệt đối không lấy từ đầu ra của Agent. `tool_call_id` chỉ là tham chiếu trace đã validate. Registry sở hữu metadata về rủi ro và xác nhận, do đó mô hình AI không thể tự nâng cấp một quyền đọc thành quyền ghi hoặc tự cung cấp các ID, giá tiền, tính sẵn sàng, tọa độ, trạng thái thanh toán hay tuyên bố thành công cuối cùng có thẩm quyền.

## Ranh Giới Thực Thi Theo Từng Domain

### 1. Dịch Vụ Đồ Ăn (Food)
Các công cụ Agent của Food bao gồm: khám phá quán, xem thực đơn/giỏ hàng, báo giá giao hàng, xem trước (preview), theo dõi đơn và chuẩn bị xác nhận. Việc thực thi đặt hàng cuối cùng / hủy đơn / hoàn tiền vẫn thuộc trách nhiệm xác nhận của Gateway/Core và chỉ gọi `FoodClient` sau khi:
- Có bản xem trước có thẩm quyền mới nhất,
- Ràng buộc payload/phiên bản/số tiền/loại tiền tệ/thời hạn hết hạn,
- Kiểm tra tính idempotent,
- Và xác nhận dùng một lần được thực thi nguyên tử.

### 2. Dịch Vụ Di Chuyển (Ride)
Ride chỉ có duy nhất một công cụ do Agent đề xuất: tính toán báo giá chuyến đi (`ride_get_quote`). Chuẩn bị đặt xe, đặt xe chính thức, theo dõi hành trình, kiểm tra trạng thái, danh sách chuyến và hủy chuyến là các khả năng do Gateway/domain nắm giữ. Domain Ride sở hữu biểu phí/lựa chọn tài xế, chuyển đổi trạng thái báo giá và đặt xe, sự kiện tracking, tính idempotent và trạng thái cuối cùng; **bắt buộc phải qua hai bước xác nhận rõ ràng** trước khi tiến hành thanh toán/đặt chuyến chính thức.

### 3. Dịch Vụ Nhà Hàng (Restaurant)
Các công cụ Agent của Restaurant bao gồm: tìm kiếm quán, xem chi tiết, kiểm tra bàn trống và giữ chỗ tạm thời (hold). Tạo đơn đặt bàn chính thức, cập nhật đơn đặt bàn cùng ID, đọc/liệt kê/hủy đơn được biểu diễn trong registry. Thao tác cập nhật là hành động cuối do Gateway sở hữu với bản xem trước bàn trống mới nhất, ràng buộc actor/phiên bản tài nguyên, người dùng xác nhận rõ ràng và đảm bảo tính idempotent của domain.

### 4. Dịch Vụ Y Tế (Healthcare)
Các công cụ Agent của Healthcare bao gồm: tra cứu chuyên khoa, tìm khung giờ khám, giữ chỗ khung giờ và hủy lịch hẹn. Đọc thông tin cơ sở/bác sĩ/lịch hẹn và xác nhận chính thức được biểu diễn dưới dạng khả năng của domain hoặc Gateway; bước xác nhận thanh toán là một bước độc lập giữa Gateway/domain nằm giữa giữ chỗ và xác nhận cuối cùng.

## Trợ Lý Hợp Nhất & Kế Hoạch Đa Dịch Vụ

Bộ lập kế hoạch của Trợ lý hợp nhất có thể phát ra các phụ thuộc tác vụ ngữ nghĩa, nhưng không bao giờ tự ý tạo ra tác dụng phụ cuối cùng. Một kế hoạch kết hợp Khám bệnh và Đặt xe (Healthcare-to-Ride) chỉ mang thông tin điểm đón ban đầu; Gateway sẽ tự động lấy thông tin điểm đến, giờ hẹn khám và cơ sở y tế từ Healthcare, đồng thời lấy thời lượng di chuyển ước tính từ Ride.

Các bộ mô tả hành động công khai (action descriptors) là bề mặt thực thi duy nhất của Trợ lý. Migration Core `007_core_assistant_action_executions.sql` ghi lại một biên lai hành động bền vững cho mỗi bộ ba `actor / conversation / action`, trong khi `011_core_multi_service_workflows.sql` ghi lại các kế hoạch điều phối của Gateway và kết quả từng bước dạng typed. Không có bất kỳ migration nào trong số này được phép trở thành nguồn thẩm quyền thay thế cho đơn hàng/đặt chỗ của Restaurant, Healthcare, Ride hay Food.

Bằng chứng kiểm thử: `apps/api-gateway/test/tools/tool-registry.spec.ts` và `apps/agent-service/tests/test_agents/test_tool_registry_parity.py`.
