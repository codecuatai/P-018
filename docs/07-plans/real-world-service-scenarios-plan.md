# Kế hoạch mô phỏng các tình huống dịch vụ thực tế

**Trạng thái:** Planned — tài liệu phân tích khoảng trống, chưa phải bằng chứng các chức năng đã được triển khai  
**Ngày rà soát:** 2026-08-16  
**Phạm vi mã nguồn:** `services/ride-service`, `services/restaurant-service`, `services/food-service`, `services/healthcare-service`

## 1. Mục tiêu

Tài liệu này đối chiếu mô hình và API hiện có trong bốn domain với các tình huống thường gặp ngoài thực tế, sau đó đề xuất thứ tự triển khai và tiêu chí nghiệm thu. Mục tiêu là mở rộng mô phỏng mà vẫn giữ nguyên các ranh giới kiến trúc:

- Gateway chỉ xác thực ở biên, điều phối và định dạng phản hồi; service của từng domain vẫn sở hữu quy tắc nghiệp vụ và trạng thái của mình.
- Agent chỉ tạo yêu cầu tool có kiểu dữ liệu rõ ràng; không tự xác nhận, tự suy luận giao dịch thành công hoặc thực hiện side effect.
- Mọi thao tác ghi có thể retry phải có idempotency key và được domain kiểm tra cùng normalized payload.
- Booking/thanh toán vẫn cần hai lần xác nhận rõ ràng theo kiến trúc hiện tại. Khi số lượng, giá, thời gian hoặc điều khoản quan trọng thay đổi thì phải xác nhận lại.
- Trường hợp nhóm/bulk phải là một aggregate do domain sở hữu. Gateway không được gọi lặp nhiều booking đơn rồi tự coi đó là một giao dịch nguyên tử.
- Kết quả thành công một phần phải được biểu diễn rõ bằng dữ liệu; không được biến thành thông báo “thành công” chung chung.

Đây không phải kế hoạch đưa hồ sơ bệnh án, chẩn đoán, đơn thuốc hoặc xử lý thanh toán thật vào các domain hiện tại. Những phần đó cần quyết định kiến trúc, pháp lý và bảo mật riêng.

## 2. Đường cơ sở đã kiểm chứng

| Service | Năng lực hiện có cần giữ lại | Giới hạn mô hình hiện tại làm cơ sở cho roadmap |
| --- | --- | --- |
| Ride | Quote có tuyến đường thật, giá và hạn dùng; prepare/confirm/cancel; idempotency; gán một tài xế; lifecycle và tracking | Một quote/booking chỉ có một `vehicle_type`, một xe, một tài xế, một điểm đón và một điểm trả. Chưa có số hành khách hoặc số xe. `pickup_time` có tham gia tính giá nhưng chưa tạo chuyến đặt trước thực sự. |
| Restaurant | Tìm kiếm, kiểm tra availability, hold có hạn, tạo/sửa/hủy reservation, kiểm tra trùng thời gian và idempotency | Availability chọn một bàn có sức chứa đủ. Chưa có aggregate ghép nhiều bàn, waitlist, deposit hoặc lifecycle check-in/no-show/completed. `seating_type` chưa được ràng buộc xuyên suốt hold/reservation. |
| Food | Giỏ nhiều nhà hàng, option và voucher, delivery quote, authoritative reprice/snapshot, order lifecycle, tracking, cancel/refund | Đơn nhiều nhà hàng vẫn có một quyết định chấp nhận chung và một trạng thái fulfillment chung. Chưa có inventory hold, substitution, dị ứng có cấu trúc, giao theo lịch hoặc partial fulfillment/refund theo từng nhà hàng/món. |
| Healthcare | Danh mục khoa/bác sĩ, hồ sơ người bệnh và người phụ thuộc, hold slot, xác nhận/hủy lịch, payment acknowledgement, actor scoping | Một appointment chỉ gắn một bệnh nhân, một bác sĩ và một slot. Chưa có reschedule, waitlist, hủy từ cơ sở, khám từ xa, tài nguyên phòng/thiết bị hoặc lifecycle check-in/no-show/completed. |

Nguồn đối chiếu chính:

- [Ride schemas](../../services/ride-service/src/api/schemas.py), [Ride domain](../../services/ride-service/src/domain/ride.py) và [Ride application service](../../services/ride-service/src/application/ride_service.py)
- [Restaurant schemas](../../services/restaurant-service/src/models/schemas.py), [Restaurant application service](../../services/restaurant-service/src/application/restaurant_service.py) và [Restaurant repository](../../services/restaurant-service/src/repositories/restaurant_repository.py)
- [Food schemas](../../services/food-service/src/models/schemas.py), [Food policies](../../services/food-service/src/domain/policies.py) và [Food quotes](../../services/food-service/src/domain/quotes.py)
- [Healthcare models](../../services/healthcare-service/src/models/medical.py) và [Healthcare routes](../../services/healthcare-service/src/api/routes.py)
- [Service boundaries](../architecture/service-boundaries.md), [workflows](../architecture/workflows.md) và [API inventory](../api/api-inventory.md)

## 3. Cách ưu tiên

- **P0 — tính đúng đắn/an toàn:** thiếu trường hợp này có thể làm đặt sai tài nguyên, sai giá, xác nhận sai, mất dữ liệu hoặc đưa ra kết luận không an toàn.
- **P1 — vận hành phổ biến:** tình huống thường gặp khi chạy thử với người dùng thật; cần có trước pilot mở rộng.
- **P2 — nâng cao:** có giá trị nhưng có thể triển khai sau khi aggregate, lifecycle và policy P0/P1 ổn định.

## 4. Ride Service

| ID | Tình huống thực tế chưa được mô phỏng đầy đủ | Thay đổi đề xuất thuộc Ride domain | Tiêu chí nghiệm thu tối thiểu | Ưu tiên |
| --- | --- | --- | --- | --- |
| RIDE-01 | Một xe chở nhiều người, ví dụ 4 người đi cùng một xe | Thêm `passenger_count`; cấu hình sức chứa hành khách của từng loại xe; bind số người và phiên bản capacity policy vào quote/confirmation | Không quote xe thiếu chỗ; đổi số người làm quote cũ mất hiệu lực; cùng idempotency key + khác số người trả conflict | P0 |
| RIDE-02 | Một nhóm cần nhiều xe, ví dụ 4 người đặt 4 xe | Tạo `GroupRideRequest`/`FleetBooking` chứa các child booking, `vehicle_count`, phân bổ hành khách, policy `ALL_OR_NOTHING` hoặc `BEST_EFFORT` | Trả được trạng thái và giá từng xe; không báo thành công toàn bộ khi chỉ có 3/4 xe; retry không sinh thêm xe | P0 |
| RIDE-03 | Nhiều điểm đón hoặc nhiều điểm trả trên cùng chuyến | Mô hình `ordered_stops`, loại stop, người liên hệ và route version; báo giá theo toàn tuyến | Đổi thứ tự/thêm stop bắt buộc requote; tracking thể hiện stop hiện tại; hoàn thành từng stop theo thứ tự hợp lệ | P1 |
| RIDE-04 | Đặt xe trước, chuyến khứ hồi hoặc chuyến lặp lại | Tách scheduled dispatch khỏi trường thời gian dùng để tính giá; thêm timezone, cutoff, window và recurrence riêng | Không điều tài xế trước window; thời gian quá khứ/DST không hợp lệ bị từ chối; mỗi occurrence có idempotency riêng | P1 |
| RIDE-05 | Có trẻ em, xe lăn, thú cưng, nhiều hành lý hoặc cần xe hỗ trợ tiếp cận | Thêm requirements có cấu trúc và capability của xe/tài xế; không dùng ghi chú tự do làm điều kiện an toàn | Chỉ match resource đáp ứng đủ capability; không có xe phù hợp trả unavailable thay vì tự hạ yêu cầu | P0 |
| RIDE-06 | Hành khách đổi điểm đón/điểm trả/loại xe sau khi đã quote hoặc đã đặt | Thêm amendment/requote workflow, version và chênh lệch giá | Thay đổi quan trọng không âm thầm sửa booking; phải tạo quote/version và confirmation mới | P0 |
| RIDE-07 | Tài xế hủy, không di chuyển hoặc mất kết nối và phải gán lại | Thêm nguyên nhân từ phía supply, timeout và driver reassignment history | Không có hai tài xế active cho cùng child booking; audit giữ snapshot tài xế cũ/mới; giá với khách không tự đổi | P1 |
| RIDE-08 | Khách đến muộn, không xuất hiện; tài xế chờ; hủy có phí/hoàn tiền | Mô hình grace period, wait timer, cancellation actor/reason, fee quote và refund state | Phí được xác nhận trước khi hủy; cùng sự kiện không trừ hai lần; clock-boundary có test | P1 |
| RIDE-09 | Giá có phí cầu đường, sân bay, vùng phục vụ, surge hoặc nâng hạng xe | Tách price components và tariff/version; service-area policy có dữ liệu | Quote giải thích từng thành phần; route ngoài vùng bị từ chối rõ; hết hạn/đổi tariff phải requote | P1 |
| RIDE-10 | Chia tiền, tip, nhiều người trả hoặc một người đặt cho người khác | Ride chỉ lưu allocation/booking party cần thiết; payment authority và payer identity phải được quyết định ở kiến trúc thanh toán/Core | Tổng allocation khớp tổng tiền; không xác nhận thay payer khác; payment failure không làm sai trip state | P2 |
| RIDE-11 | Khách đổi ý giữa `ALL_OR_NOTHING` và `BEST_EFFORT` khi nhóm xe chỉ được đáp ứng một phần | Version policy trong aggregate và yêu cầu confirmation mới | Policy mới không tái sử dụng confirmation cũ; các child đã giữ chỗ được giải phóng/giữ lại theo quy tắc xác định | P0 |
| RIDE-12 | Báo sự cố an toàn, đồ thất lạc hoặc tranh chấp sau chuyến | Tạo incident reference tối thiểu và handoff sang vận hành; không nhét dữ liệu nhạy cảm vào log/tracking | Incident actor-scoped, không lộ vị trí/lịch sử cho người khác; booking lifecycle không bị sửa tùy tiện | P2 |

### 4.1. Case bắt buộc: một xe cho bốn người

```gherkin
Given một yêu cầu có passenger_count = 4
When người dùng yêu cầu quote cho một vehicle_type
Then Ride Service phải kiểm tra capacity của vehicle_type tại phiên bản policy hiện hành
And chỉ trả quote nếu sức chứa đáp ứng đủ
And quote, preview và confirmation đều phải mang cùng passenger_count và capacity_policy_version
```

Các nhánh phải kiểm thử:

1. Xe đáp ứng đúng 4 chỗ, quote hợp lệ.
2. Xe không đủ chỗ, trả lỗi có mã ổn định và gợi ý loại xe phù hợp từ dữ liệu thật.
3. Sau quote, người dùng đổi từ 4 thành 5 người: quote/confirmation cũ không còn dùng được.
4. Hai request cùng idempotency key và cùng payload trả cùng kết quả; khác `passenger_count` trả conflict.

### 4.2. Case bắt buộc: bốn xe cho bốn người

```gherkin
Given một GroupRideRequest có vehicle_count = 4 và passenger_count = 4
When Ride Service giữ và phân bổ supply
Then mỗi child booking có quote, driver, giá và trạng thái riêng
And group có aggregate status được tính theo policy đã xác nhận
And Gateway không tự tạo bốn booking đơn rồi suy luận aggregate status
```

Các nhánh phải kiểm thử:

1. `ALL_OR_NOTHING`: chỉ giữ được 3/4 xe thì toàn nhóm không được xác nhận; các hold đã tạo phải được giải phóng an toàn.
2. `BEST_EFFORT`: 3/4 xe được xác nhận thì group trả `PARTIALLY_CONFIRMED`, nêu rõ xe nào chưa có.
3. Một tài xế hủy sau xác nhận: chỉ child tương ứng vào reassignment; group không bị báo `COMPLETED`.
4. Retry do timeout không tạo xe thứ năm.
5. Hủy cả nhóm và hủy một child là hai operation khác nhau, có confirmation/idempotency riêng.

## 5. Restaurant Service

| ID | Tình huống thực tế chưa được mô phỏng đầy đủ | Thay đổi đề xuất thuộc Restaurant domain | Tiêu chí nghiệm thu tối thiểu | Ưu tiên |
| --- | --- | --- | --- | --- |
| REST-01 | Nhóm đông phải ghép hai hoặc nhiều bàn | Tạo `TableAssignment` nhiều bàn, capacity tổng, adjacency/combinability và assignment hold | Không gán một bàn cho hai reservation trùng giờ; thuật toán không coi hai bàn rời xa là ghép được nếu policy cấm | P0 |
| REST-02 | Một nhóm muốn tách thành nhiều bàn/reservation | Tạo group reservation với child assignment và policy ngồi cùng khu vực hay chấp nhận tách | Trạng thái partial rõ ràng; hủy nhóm/hủy bàn riêng không nhập nhằng; retry không tạo thêm child | P1 |
| REST-03 | Yêu cầu khu vực trong nhà/ngoài trời, phòng riêng, bàn thấp hoặc tiếp cận xe lăn | Bind `seating_requirements` vào availability → hold → reservation; capability thuộc table/area | Không làm mất yêu cầu sau hold; thay đổi yêu cầu phải re-check availability và xác nhận lại | P0 |
| REST-04 | Giờ mở cửa, ca phục vụ, ngày nghỉ, blackout, thời gian dọn bàn | Mô hình service windows, timezone, turn time và buffer trong availability | Không giữ bàn ngoài giờ; reservation sát nhau phải tính buffer; clock-boundary có test | P0 |
| REST-05 | Hết bàn nhưng khách muốn vào danh sách chờ | Tạo `WaitlistEntry`, priority policy, offer có hạn và claim operation | Offer hết hạn không thể claim; một slot không được cấp cho hai người; notification chỉ là tín hiệu, domain vẫn xác thực claim | P1 |
| REST-06 | Khách check-in, đến muộn, đã ngồi, hoàn thành hoặc no-show | Mở rộng lifecycle và các transition có actor/clock rõ ràng | Không thể từ CANCELLED sang SEATED; no-show chỉ sau grace period; bàn được giải phóng đúng lúc | P1 |
| REST-07 | Nhà hàng yêu cầu tiền cọc, có phí hủy/no-show hoặc hoàn cọc | Deposit quote/version, cancellation policy snapshot và refund state; payment authority vẫn ở boundary phù hợp | Giá/điều khoản đổi phải xác nhận lại; hủy retry không hoàn hai lần; reservation và payment state không bị gộp sai | P0 |
| REST-08 | Nhà hàng chủ động hủy, đổi giờ hoặc đổi bàn | Thêm operator action, reason, alternatives và customer re-confirmation | Không tự chấp nhận giờ/giá mới thay khách; audit phân biệt customer/operator action | P1 |
| REST-09 | Khách đổi số người hoặc giờ sau xác nhận | Amendment tạo hold/version mới trước khi giải phóng assignment cũ theo policy | Nếu không còn bàn, reservation cũ được giữ hoặc hủy theo lựa chọn rõ; confirmation cũ không dùng cho payload mới | P0 |
| REST-10 | Dị ứng, trẻ em/ghế trẻ em, thú cưng, dịp đặc biệt hoặc mang bánh | Trường có cấu trúc cho constraint có thể kiểm tra; ghi chú tự do chỉ bổ sung ngữ cảnh | Dị ứng không được biến thành cam kết an toàn nếu nhà hàng chưa xác nhận capability; constraint không bị rơi qua các bước | P0 |
| REST-11 | Một người vô tình đặt hai nhà hàng trùng giờ | Actor overlap policy và cảnh báo/xác nhận ngoại lệ thay vì suy luận tự động | Hai request đồng thời được xử lý nhất quán; ngoại lệ có audit và explicit confirmation | P1 |
| REST-12 | Tiệc riêng, thực đơn cố định, thời lượng dài hoặc booking lặp lại | Reservation product/occasion, duration policy, minimum spend và occurrence model | Mỗi occurrence có resource/price version; không tạo hàng loạt side effect trước confirmation | P2 |

## 6. Food Service

| ID | Tình huống thực tế chưa được mô phỏng đầy đủ | Thay đổi đề xuất thuộc Food domain | Tiêu chí nghiệm thu tối thiểu | Ưu tiên |
| --- | --- | --- | --- | --- |
| FOOD-01 | Đơn nhiều nhà hàng nhưng một nơi từ chối hoặc chuẩn bị chậm | Tách `FulfillmentGroup` thành `RestaurantLeg` có decision, giá, prep time và trạng thái riêng | Một leg từ chối không làm các leg khác giả thất bại/thành công; aggregate thể hiện partial; refund theo leg | P0 |
| FOOD-02 | Món hết hàng trong khi nhiều người cùng đặt | Inventory reservation có TTL/version, quantity atomically decrement hoặc capacity policy tương đương | Hai order đồng thời không bán vượt tồn; hold hết hạn được giải phóng; retry không trừ tồn hai lần | P0 |
| FOOD-03 | Nhà hàng đề nghị đổi món/topping/kích cỡ sau thanh toán | `SubstitutionProposal` có price delta, allergen delta, expiry và customer decision | Không tự thay món; đổi giá/dị ứng yêu cầu xác nhận mới; từ chối dẫn tới hủy/refund đúng phạm vi | P0 |
| FOOD-04 | Người dùng có dị ứng, chế độ ăn hoặc cần tránh lây nhiễm chéo | Allergen/dietary attributes có nguồn và trạng thái “không xác minh được”; policy không suy luận an toàn từ keyword/note | Khi dữ liệu thiếu phải nói không xác minh; không tự khẳng định “an toàn”; constraint được revalidate khi substitution | P0 |
| FOOD-05 | Đặt giao ngay, giao theo giờ, preorder trước giờ mở cửa | Thêm fulfillment window, timezone, cutoff, restaurant availability và capacity theo khung giờ | Không nhận scheduled order ngoài policy; giá/menu thay đổi trước confirm phải reprice; timeout có test clock | P1 |
| FOOD-06 | Cả nhóm cùng thêm món vào một giỏ | Collaborative cart có owner/member/role, optimistic version và item attribution | Hai edit đồng thời không làm mất item; chỉ người có quyền checkout; thành viên rời nhóm không lộ dữ liệu ngoài scope | P1 |
| FOOD-07 | Chia tiền theo người/món, dùng nhiều phương thức hoặc tip | Payment allocation cần quyết định với payment/Core; Food giữ line attribution và tổng authoritative | Tổng phần thanh toán khớp tổng order; một payer fail không được báo toàn đơn paid; không charge lặp khi retry | P2 |
| FOOD-08 | Một order giao tới nhiều địa chỉ hoặc nhiều người nhận | Child delivery leg theo địa chỉ/người nhận, route và fee riêng; cân nhắc tách order nếu invariant đơn giản hơn | Mỗi handoff có trạng thái; không đánh dấu toàn bộ delivered khi còn leg thất bại | P2 |
| FOOD-09 | Giao không tiếp xúc, chung cư/cổng, OTP, người nhận khác hoặc pickup tại quán | Structured handoff method/instruction, contact scope và proof reference tối thiểu | OTP không log/plaintext; sai người nhận không được auto-complete; self-pickup không gán driver | P1 |
| FOOD-10 | Tài xế hủy, giao thất bại, khách không nghe máy, cần quay lại/hoàn hàng | Reassignment, delivery attempt, grace period và terminal/refund policy | Chỉ một courier active cho mỗi leg; failed handoff không thành delivered; retry transition idempotent | P1 |
| FOOD-11 | Thiếu món, sai món, món hỏng hoặc cần hoàn một phần sau giao | Dispute/adjustment theo line item và evidence reference; không lưu dữ liệu nhạy cảm dư thừa | Refund tổng không vượt số đã trả; cùng claim không xử lý hai lần; trạng thái order gốc vẫn audit được | P1 |
| FOOD-12 | Hủy một món hoặc một nhà hàng thay vì hủy toàn đơn | Partial cancel theo line/leg, cutoff theo prep status, fee/refund breakdown | Không hủy món đã vượt cutoff nếu policy cấm; tổng tiền/tax/fee được tính lại authoritative | P0 |
| FOOD-13 | Phí giao, phí dịch vụ, đơn nhỏ, surge, thuế, tip và khuyến mại chồng nhau | Price component/version và promotion-combination policy | Preview giải thích tổng; rule stacking deterministic; đổi component làm snapshot/confirmation cũ hết hiệu lực | P1 |
| FOOD-14 | Một courier lấy nhiều nhà hàng với thời gian sẵn sàng và nhiệt độ bảo quản khác nhau | Per-leg readiness, route optimization inputs, max wait/cold-chain capability | Không pickup leg chưa ready; route quá hạn chất lượng phải replan hoặc báo unavailable, không che giấu | P2 |

## 7. Healthcare Service

| ID | Tình huống thực tế chưa được mô phỏng đầy đủ | Thay đổi đề xuất thuộc Healthcare domain | Tiêu chí nghiệm thu tối thiểu | Ưu tiên |
| --- | --- | --- | --- | --- |
| HEALTH-01 | Đổi lịch sau khi đã xác nhận | Reschedule operation nguyên tử: hold slot mới, version giá/điều khoản, xác nhận lại, sau đó giải phóng slot cũ theo policy | Không mất lịch cũ khi slot mới thất bại; không giữ cả hai ngoài policy; retry không tạo lịch thứ ba | P0 |
| HEALTH-02 | Một phụ huynh đặt các lịch liên tiếp cho nhiều con/người phụ thuộc | `AppointmentGroup` với child appointment, relationship check và policy all-or-nothing/best-effort | Quyền được kiểm tra cho từng bệnh nhân; partial status rõ; không dùng một confirmation chung khi payload từng người khác | P1 |
| HEALTH-03 | Hết lịch nhưng bệnh nhân muốn chờ slot trống | Waitlist theo bác sĩ/khoa/time window, offer có hạn và claim atomically | Một slot không cấp cho hai claim; offer hết hạn bị từ chối; thứ tự ưu tiên có policy/audit | P1 |
| HEALTH-04 | Bác sĩ/cơ sở hủy hoặc đổi lịch và đề xuất bác sĩ khác | Provider cancellation, reason, alternative slots và customer re-confirmation | Không tự đổi bác sĩ/giá thay bệnh nhân; refund/rebook state rõ; audit actor đúng | P0 |
| HEALTH-05 | Các loại khám có thời lượng khác nhau hoặc cần phòng/thiết bị/kỹ thuật viên | Appointment type và multi-resource availability do Healthcare sở hữu | Booking chỉ thành công khi mọi resource cùng available; concurrent booking không double-book bất kỳ resource nào | P0 |
| HEALTH-06 | Khám trực tiếp hoặc từ xa | Visit mode, facility/telehealth capability, timezone, jurisdiction và technical readiness | Không tạo telehealth cho loại khám không hỗ trợ; link/token không lộ trong log; location requirement được kiểm tra | P1 |
| HEALTH-07 | Triệu chứng, dị ứng, thuốc đang dùng, thai kỳ, nhu cầu xe lăn/ngôn ngữ | Intake có cấu trúc, consent và mức độ nhạy cảm; tách preference khỏi clinical decision | Agent không chẩn đoán; thiếu dữ liệu không được tự điền; chỉ chia sẻ tối thiểu cho đúng mục đích | P0 |
| HEALTH-08 | Bảo hiểm, giấy giới thiệu, pre-authorization, đồng chi trả | Eligibility/preauth reference và trạng thái riêng; không biến kết quả ước tính thành cam kết chi trả | “Chưa xác minh” hiển thị rõ; đổi coverage/price phải xác nhận lại; không lưu credential bảo hiểm không cần thiết | P1 |
| HEALTH-09 | Hủy lịch đã thanh toán, phí hủy và hoàn tiền | Cancellation policy snapshot, refund state và deadline theo timezone | Không hoàn hai lần; trạng thái appointment và payment không mâu thuẫn; fee được preview trước confirmation | P0 |
| HEALTH-10 | Check-in, đến muộn, no-show, đang khám, hoàn thành | Mở rộng lifecycle với transition do cơ sở/bệnh nhân thực hiện | Không hoàn thành từ trạng thái cancelled; late/no-show theo grace period; lịch sử immutable/auditable | P1 |
| HEALTH-11 | Tái khám, chuỗi trị liệu hoặc lịch định kỳ | Care-series reference và occurrence booking; mỗi occurrence vẫn là appointment độc lập | Không giữ hàng loạt slot trước consent; thay đổi một occurrence không âm thầm đổi cả chuỗi | P2 |
| HEALTH-12 | Người giám hộ/đại diện đặt lịch, quyền hết hạn hoặc bị thu hồi | Relationship lifecycle, scope và thời hạn; confirmation bound vào actor/patient | Thu hồi quyền chặn thao tác mới nhưng giữ audit; không lộ lịch của dependent khác | P0 |
| HEALTH-13 | Người dùng mô tả dấu hiệu khẩn cấp khi đang tìm lịch | Triage boundary chỉ nhận diện rule/red flag đã được phê duyệt và handoff tới cấp cứu; không tạo chẩn đoán | Luồng khẩn cấp không tiếp tục bán slot như bình thường; thông điệp không khẳng định chẩn đoán; có test policy bắt buộc | P0 |
| HEALTH-14 | Kết quả xét nghiệm, bệnh án, đơn thuốc, chat bác sĩ | Đánh dấu ngoài scope booking hiện tại; cần ADR/domain riêng, consent, retention, audit và pháp lý trước khi triển khai | Không thêm tùy tiện vào appointment notes; chỉ bắt đầu sau khi có quyết định ownership và threat/privacy review | P2 |

## 8. Các tình huống kết hợp nhiều service

Các luồng này thuộc Gateway/Core về điều phối, nhưng từng resource, giá và transition vẫn phải do domain tương ứng xác nhận.

| ID | Tình huống | Mô hình/điều phối cần có | Kết quả bắt buộc | Ưu tiên |
| --- | --- | --- | --- | --- |
| CROSS-01 | Đặt bàn cho nhóm và đặt nhiều xe đưa các thành viên từ nhiều điểm đến nhà hàng | Workflow liên kết reservation group với nhiều ride group; dependency theo arrival window, không dùng khóa ngoại chéo DB | Restaurant hoặc một ride thất bại phải hiển thị từng task và hỏi giữ/hủy phần đã thành công | P1 |
| CROSS-02 | Đặt lịch cho người phụ thuộc và xe có khả năng hỗ trợ xe lăn | Healthcare xác nhận actor/patient; Ride xác nhận accessibility capability; Gateway chỉ truyền reference tối thiểu | Không gửi triệu chứng/hồ sơ y tế sang Ride; không đặt xe thiếu capability | P0 |
| CROSS-03 | Đặt món giao tới nhà hàng/cơ sở y tế vào thời điểm cụ thể | Food fulfillment window phụ thuộc ETA/appointment/reservation snapshot | Thời gian thay đổi phải replan/reconfirm; không coi ETA khuyến nghị là cam kết | P1 |
| CROSS-04 | Một task trong kế hoạch nhiều dịch vụ hết hạn quote/hold | Workflow version và dependency graph; refresh đúng task rồi đánh giá các task phụ thuộc | Không dùng confirmation cũ cho payload/giá mới; trạng thái các task còn lại không bị mất | P0 |
| CROSS-05 | Người dùng chọn “tất cả hoặc không” so với “giữ phần làm được” | Explicit workflow completion policy, compensation proposal và confirmation riêng cho hành động hủy | Không tự rollback side effect; partial success hiển thị rõ; mỗi domain xử lý cancellation/idempotency của mình | P0 |
| CROSS-06 | Hủy/đổi lịch kéo theo cân nhắc đổi xe, bàn hoặc đồ ăn | Replan tạo proposal mới; không cascade side effect im lặng | Người dùng thấy chênh lệch giá/phí và xác nhận từng hành động tài chính cần thiết | P0 |
| CROSS-07 | Hai tab/hai lượt hội thoại đồng thời sửa cùng kế hoạch | Workflow optimistic version, stale-write conflict và reference resolution | Lượt cũ không ghi đè lượt mới; confirmation gắn đúng normalized plan version | P0 |
| CROSS-08 | Chia tiền cho nhiều người trên nhiều dịch vụ | Cần ADR cho payment allocation, payer consent và refund routing trước khi nối vào domain | Không service nào tự coi payment estimate là thành công; tổng charge/refund có invariant và audit | P2 |

## 9. Thay đổi mô hình được đề xuất

Các tên dưới đây là hướng thiết kế, chưa phải hợp đồng API đã chốt:

| Domain | Aggregate/entity đề xuất | Invariant chính |
| --- | --- | --- |
| Ride | `GroupRideRequest`, `RideParty`, `ChildRideBooking`, `OrderedStop`, `VehicleRequirement` | Số người không vượt tổng capacity đã phân bổ; một child chỉ có tối đa một driver active; aggregate status phản ánh đúng policy và child states. |
| Restaurant | `ReservationGroup`, `TableAssignment`, `SeatingRequirement`, `WaitlistEntry`, `WaitlistOffer` | Mọi bàn trong assignment phải available trong toàn interval + buffer; offer chỉ claim một lần; thay đổi resource/giá cần version mới. |
| Food | `FulfillmentGroup`, `RestaurantLeg`, `InventoryHold`, `SubstitutionProposal`, `DeliveryLeg`, `OrderAdjustment` | Tổng order bằng tổng leg/component authoritative; stock không âm; substitution phải được khách quyết định; refund không vượt captured amount. |
| Healthcare | `AppointmentGroup`, `AppointmentType`, `ResourceRequirement`, `WaitlistOffer`, `RescheduleRequest`, `VisitIntake` | Một resource không bị double-book; reschedule không làm mất cả slot cũ lẫn mới; quyền actor-patient được kiểm tra ở mọi write. |

Không đặt các entity này trong `packages/` như shared business models. `packages/contracts` chỉ chứa contract/OpenAPI/generated client sau khi ownership và phiên bản đã được domain chốt.

## 10. Kế hoạch triển khai theo giai đoạn

### Giai đoạn A — chốt quy tắc và contract

1. Chốt glossary: party, group, child booking, leg, resource hold, partial success, all-or-nothing và best-effort.
2. Viết ADR cho group/bulk aggregate và payment allocation; xác định rõ ownership giữa Core/Gateway và từng domain.
3. Chốt state machine, normalized payload, version, expiry, idempotency scope và compensation policy cho từng P0.
4. Cập nhật OpenAPI/tool contract bằng proposal trước, chạy compatibility review với Gateway/Agent/Web.

**Điều kiện hoàn tất:** state diagrams, decision tables và contract examples được review; không còn field quan trọng chỉ nằm trong free text.

### Giai đoạn B — xây nền tảng domain P0

Thứ tự khuyến nghị:

1. RIDE-01, RIDE-02, RIDE-05, RIDE-11.
2. REST-01, REST-03, REST-04, REST-09, REST-10.
3. FOOD-01 đến FOOD-04 và FOOD-12.
4. HEALTH-01, HEALTH-04, HEALTH-05, HEALTH-07, HEALTH-09, HEALTH-12, HEALTH-13.

Mỗi thay đổi schema phải có migration do đúng service sở hữu, deterministic seed nếu cần, cập nhật data architecture và rollback/compatibility plan. Không chạy migration phá hủy hoặc xóa volume để sửa trạng thái.

**Điều kiện hoàn tất:** domain tests, migration tests, PostgreSQL concurrency tests và OpenAPI compatibility tests đều qua; readiness chỉ báo dependency thực sự được kiểm tra.

### Giai đoạn C — tích hợp Gateway, Agent và confirmation

1. Thêm typed client và tool request; Agent không tự loop child booking.
2. Hiển thị proposal gồm child/leg, giá, expiry, policy và phần chưa đáp ứng.
3. Bind confirmation với actor, action, normalized payload/hash, resource/quote version, giá, currency và expiry.
4. Thêm replan khi quote/hold hết hạn, supply partial hoặc payload đổi.

**Điều kiện hoàn tất:** test chứng minh stale confirmation bị từ chối, timeout/retry không nhân side effect và partial success không bị trình bày thành success toàn bộ.

### Giai đoạn D — UI và vận hành P1

1. UI cho group/child/leg, trạng thái partial, amendment và waitlist.
2. Notification chỉ đánh thức luồng; domain vẫn xác thực offer/claim tại thời điểm ghi.
3. Bổ sung operator actions có audit cho provider/restaurant/driver cancellation.
4. Triển khai các case P1 sau khi telemetry của P0 ổn định.

### Giai đoạn E — P2 và kiểm chứng quy mô

1. Split payment, recurring workflow, multi-address và incident/dispute nâng cao.
2. Load test contention trên inventory/slot/table/driver supply.
3. Fault injection ở ranh giới Gateway ↔ service và payment/provider; kiểm tra recovery sau restart.

## 11. Ma trận kiểm thử và minh chứng phải nộp khi triển khai

Mỗi case chỉ được chuyển từ `planned` sang `implemented` khi có đủ bằng chứng tương ứng:

| Loại bằng chứng | Nội dung bắt buộc |
| --- | --- |
| Domain unit test | Capacity, transition hợp lệ/không hợp lệ, giá/refund invariant, expiry và policy branch. |
| Repository/PostgreSQL integration | Hai request đồng thời tranh cùng xe/bàn/stock/slot; unique/locking/idempotency hoạt động sau restart. |
| Contract test | OpenAPI khớp runtime schema; enum/error/idempotency headers ổn định; backward compatibility được kiểm tra. |
| Gateway test | Actor scoping, correlation, typed client, partial response shaping; Gateway không sở hữu domain invariant. |
| Agent multi-turn test | Thiếu thông tin phải hỏi lại; thay đổi payload phải requote/reconfirm; không tự xác nhận thay người dùng. |
| End-to-end test | Happy path, unavailable, partial success, expiry, cancellation, provider failure và retry/restart. |
| Safety/privacy test | Không log token, OTP, dữ liệu y tế dư thừa hoặc raw prompt; không chia sẻ dữ liệu chéo domain ngoài mục đích. |
| Tài liệu | API inventory, workflow, service boundary, data architecture và project status được cập nhật cùng thay đổi. |

Các lệnh kiểm tra nền bắt buộc của repository vẫn phải chạy cùng test của service bị thay đổi:

```powershell
python scripts/quality/validate-env-config.py
docker compose --env-file .env.example config --quiet
```

Ngoài log test, bằng chứng nghiệm thu nên gồm:

1. Tên test và output pass cho từng acceptance branch.
2. Request/response đã loại bỏ dữ liệu nhạy cảm, thể hiện idempotency, version và trạng thái child/leg.
3. Ảnh hoặc video E2E cho luồng người dùng, nhưng không dùng ảnh thay cho test domain/concurrency.
4. `git diff --check`, danh sách file đổi và liên kết tới migration/contract/doc tương ứng.

## 12. Bộ P0 nhỏ nhất nên thực hiện trước

Nếu cần chia thành một milestone có thể kiểm thử đầu-cuối, nên chọn:

1. **Ride:** số hành khách/capacity và group nhiều xe với partial policy.
2. **Restaurant:** ghép nhiều bàn, bind seating requirement và giờ phục vụ/buffer.
3. **Food:** per-restaurant leg, inventory hold, substitution và allergen uncertainty.
4. **Healthcare:** reschedule nguyên tử, provider cancellation, multi-resource slot và emergency boundary.
5. **Cross-service:** versioned plan, explicit all-or-nothing/best-effort và stale confirmation rejection.

Milestone này giải quyết các lỗi có rủi ro cao nhất: đặt thiếu tài nguyên, ghi nhận thành công sai, double-book/double-charge, tự thay đổi điều khoản và đưa ra kết luận an toàn không có dữ liệu.

## 13. Các quyết định còn mở

Trước khi triển khai cần trả lời và ghi thành ADR hoặc decision record:

1. Group booking có giữ tất cả resource trước confirmation hay chỉ quote rồi giữ khi confirm; TTL và thứ tự lock là gì?
2. `ALL_OR_NOTHING` có nghĩa nguyên tử tại thời điểm nào khi các provider bên ngoài không hỗ trợ transaction phân tán?
3. Payment/split payment/refund routing thuộc Core hay một payment service riêng; domain lưu reference nào?
4. Ai được mời, xem và sửa group plan; dữ liệu người tham gia được giữ ở Core hay domain ở mức tối thiểu nào?
5. Chính sách partial cancellation và giá lại áp dụng theo child/leg hay toàn aggregate?
6. Trường nào là yêu cầu cứng, trường nào chỉ là preference; khi không đáp ứng thì reject hay xin người dùng nới điều kiện?
7. Với healthcare, bộ red flag nào được chuyên gia phê duyệt và luồng handoff khẩn cấp nào phù hợp với khu vực vận hành?
8. Dữ liệu catalog/capability nào có nguồn authoritative, version và thời hạn tin cậy; khi không xác minh được phải trình bày ra sao?

