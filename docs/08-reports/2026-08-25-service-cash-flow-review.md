# Báo cáo rà soát luồng dịch vụ và thanh toán

Ngày rà soát: 2026-08-25  
Phạm vi: Food, Ride, Restaurant, Healthcare; Gateway confirmation/payment; các tình huống retry, idempotency, thay đổi dữ liệu, lỗi thanh toán và refund.

## 1. Phương pháp và giới hạn

Repository không có CLI hoặc package tên `codegraph`. Việc kiểm tra dùng đồ thị gọi mã nguồn và route:

`Web/Mobile -> Gateway assistant/action -> typed domain client -> domain service -> Core payment/confirmation evidence`.

LangGraph trong Agent chỉ phân loại, điền slot và phát proposal có kiểu. Agent không gọi domain, không xác nhận và không quyết định giao dịch thành công.

Từ “cash” trong yêu cầu được hiểu là luồng thanh toán. MVP hiện dùng payment sandbox/acknowledgement; không có payment provider thật và không có luồng thu tiền mặt COD riêng. Vì vậy kết quả không phải bằng chứng charge tiền thật.

## 2. Đồ thị luồng quan sát được

### Food

`tìm món -> chọn món -> cart mutation (idempotent) -> chọn địa chỉ -> preview/quote -> food_checkout -> confirmation được ràng buộc snapshot/version/amount -> food_payment -> sandbox payment -> Food tạo order -> tracking/refund khi phù hợp`

- Có hai action tách biệt: `food_checkout` và `food_payment`.
- Order yêu cầu snapshot hash, cart version, amount/currency và quote version khớp dữ liệu authoritative.
- Cart write và transition dùng idempotency; replay cùng payload trả cùng logical result, đổi payload phải conflict.
- Payment method mà Assistant đang gửi mặc định là `card`; domain quote công bố `bank_transfer`, `card`, `e_wallet`. Chưa có COD/cash.

### Ride

`tạo quote -> xác nhận thông tin chuyến -> prepare booking -> xác nhận thanh toán -> confirm booking -> tìm/ghép tài xế -> tracking -> completed/cancelled/payment_failed`

- Đúng mô hình hai xác nhận: `ride_service` rồi `ride_payment`.
- Quote, route, passenger capacity, tariff/resource version và confirmation evidence được ràng buộc.
- Thay đổi điểm đến làm quote cũ mất hiệu lực; confirmation cũ không được dùng cho payload mới.
- “Thanh toán” là payment reference/sandbox trước khi gửi tìm tài xế, không phải charge thật.

### Healthcare

`tìm khoa/bác sĩ/slot -> giữ slot -> xác nhận/acknowledge payment -> xác nhận lịch -> confirmed/cancelled`

- Domain chặn final confirmation nếu chưa có trạng thái payment.
- Hold hết hạn chặn cả payment lẫn final confirmation và giải phóng slot.
- Giá không rõ vẫn được browse nhưng không được hold; không tự bịa giá 0.
- Payment là acknowledgement local/domain, không có provider thật.

### Restaurant

`tìm nhà hàng -> kiểm tra availability snapshot -> hold bàn -> pending confirmation -> xác nhận reservation -> update/cancel`

- Gateway lưu pending confirmation và không chạy final tool trước khi người dùng xác nhận.
- Availability có snapshot/version/TTL; hold và lifecycle write có idempotency và actor scope.
- MVP không thể hiện bước payment/charge riêng cho đặt bàn. Không nên mô tả Restaurant là đã thanh toán.

## 3. Tình huống kiểm thử và kết quả

### Kết quả thực chạy Gateway

Lệnh:

```powershell
corepack pnpm --dir apps/api-gateway exec jest `
  test/domain-workflows.spec.ts `
  test/payment.saga.spec.ts `
  test/workflow.refund.spec.ts `
  test/ride-conversation.lifecycle.spec.ts `
  --runInBand --forceExit
```

Kết quả: **PASS — 4 suites, 8/8 tests**.

| Tình huống | Kết quả | Phân tích |
| --- | --- | --- |
| Restaurant tạo pending confirmation | PASS | Final tool không chạy trước xác nhận. |
| Healthcare final confirm khi chưa payment | PASS | Gateway/domain chặn bypass payment. |
| Healthcare giữ structured candidates | PASS | Read result không bị biến thành authority giả. |
| Payment provider timeout | PASS | Attempt được lưu; trạng thái eventual được đọc lại, không confirm lần hai. |
| Refund retry | PASS | Dùng một provider reference bền vững cho retry. |
| Refund thất bại terminal | PASS | Không bị worker reclaim và chạy vô hạn ở poll sau. |
| Ride đổi destination | PASS | Quote route trước bị invalidated. |
| Ride sau payment đang tìm tài xế | PASS | Gateway ở tracking, không tuyên bố đã hoàn thành chuyến. |

Ghi chú: Jest không tự thoát sau khi hoàn tất và phải dùng `--forceExit`. Đây là dấu hiệu có async/open handle chưa được cleanup trong test/runtime fixture. Test vẫn báo pass trước khi force exit, nhưng cần điều tra bằng `--detectOpenHandles`.

### Kiểm tra domain Python

Các nhóm Food, Ride, Healthcare và Restaurant không thể khởi tạo `python.exe`/`py.exe` trong môi trường hiện tại, với lỗi Windows: `A specified logon session does not exist`. Trạng thái: **BLOCKED_BY_ENVIRONMENT**, không tính PASS hoặc FAIL.

Nội dung test đã được đối chiếu tĩnh và có coverage dự kiến cho:

- Food: catalog thay đổi trước create order, voucher deterministic, transition idempotency, driver release/timeline, cart replay và changed-payload conflict.
- Ride: hai confirmation, one-time/payload-bound confirmation, quote expiry, route change, actor isolation, capacity, driver matching, cancellation version và full lifecycle.
- Healthcare: idempotency header, unknown price, expired hold, payment/final confirmation, bypass payment và actor-scoped patient links.
- Restaurant: availability, hold, update/cancel, actor scope, exact replay, changed-payload conflict và idempotency key boundary.

Đây chỉ là bằng chứng test tồn tại và phù hợp thiết kế; cần chạy lại khi Python launcher hoạt động.

## 4. Đánh giá

### Điểm đạt

1. Boundary đúng: client chỉ qua Gateway; Agent không thực hiện side effect.
2. Food và Ride thể hiện rõ hai bước xác nhận quan trọng.
3. Healthcare không cho final confirmation vượt payment acknowledgement.
4. Idempotency và version binding xuất hiện ở Gateway lẫn domain, giảm tạo trùng và stale confirmation.
5. Timeout/retry/refund có state bền vững và tránh gọi provider lặp thiếu kiểm soát.
6. Gateway không coi `SEARCHING_DRIVER` là hoàn thành Ride.

### Rủi ro và khoảng trống

1. **Không có cash/COD thật:** UI/Assistant hiện thiên về `card`; chưa có nghiệp vụ thu tiền mặt, đối soát COD, thất bại thu tiền hoặc hoàn tiền tiền mặt.
2. **Payment chỉ là sandbox/acknowledgement:** không nên quảng bá là tích hợp thanh toán production.
3. **Restaurant không có payment stage riêng:** cần ghi rõ nếu sản phẩm dự định đặt cọc/thu phí giữ bàn.
4. **Python tests chưa chạy lại được:** bằng chứng domain trong lần rà soát này còn thiếu do môi trường.
5. **Jest open handle:** có thể làm CI chậm/treo hoặc che cleanup lỗi; nên tìm handle bằng test scope nhỏ.
6. **Assistant Food hard-code `card`:** người dùng chưa chọn phương thức dù domain có nhiều phương thức; nếu phương thức là material term thì phải đưa vào confirmation payload/UI.
7. **Legacy và canonical flow cùng tồn tại:** các route workflow cũ vẫn có thể gây sai khác hành vi nếu UI/test gọi nhầm; hướng chuẩn là `/api/v1/assistant/chat` + `/api/v1/assistant/actions` hoặc Gateway Service Hub được tài liệu hóa.

## 5. Khuyến nghị ưu tiên

1. Sửa môi trường Python rồi chạy các suite domain nêu trên; chỉ sau đó mới nâng trạng thái domain lên verified.
2. Chạy `jest ... --detectOpenHandles` theo từng suite và cleanup timer/server/database handles.
3. Quyết định rõ payment methods của MVP: chỉ sandbox card hay hỗ trợ bank transfer/e-wallet; loại bỏ lựa chọn không có end-to-end behavior.
4. Nếu cần “cash/COD”, thiết kế domain state riêng (`CASH_DUE`, `CASH_COLLECTED`, `CASH_COLLECTION_FAILED`, reconciliation) thay vì map vào `SUCCEEDED` ngay lúc đặt.
5. Thêm bảng test xuyên dịch vụ cho: double click, retry cùng key, retry khác payload, quote hết hạn, amount đổi, provider timeout, provider success đến muộn, refund retry, cross-user action và service restart.
6. Đảm bảo UI luôn hiển thị amount/currency, phương thức, resource/quote freshness và hậu quả trước confirmation thứ hai.

## 6. Kết luận

Luồng hiện tại nhìn chung tuân thủ boundary và confirmation safety của repository. Gateway payment/recovery scenarios được thực chạy và đạt 8/8. Điểm quan trọng nhất là hệ thống mới chứng minh **sandbox payment flow**, không chứng minh cash/COD hoặc payment provider production. Food, Ride, Healthcare và Restaurant có test domain phù hợp nhưng lần rà soát này chưa thể thực thi do lỗi Python launcher của máy; trạng thái đó phải giữ là BLOCKED, không được suy diễn thành PASS.
