# BÁO CÁO CHI TIẾT: LỖI LUỒNG ĐẶT ĐỒ ĂN VÀ VẤN ĐỀ KIẾN TRÚC X-ONE AGENT

Tài liệu này tổng hợp toàn bộ các vấn đề nghiêm trọng đang xảy ra trong luồng hội thoại và tính năng đặt đồ ăn của X-One. Báo cáo dựa trên phân tích 100+ trace log đầu tiên, mã nguồn orchestration và phản hồi thực tế khi tương tác chạm trên UI.

---

## 1. VẤN ĐỀ VỀ QUẢN LÝ TRẠNG THÁI (BÓNG MA TASK CŨ)

**🔴 Vấn đề:**
Người dùng cảm thấy khó chịu vì hệ thống "nhớ dai" một cách sai lệch. Các Task đã bị hủy (discarded) hoặc đã hoàn thành vẫn liên tục quay trở lại can thiệp vào các đoạn chat sau, làm hỏng luồng giao tiếp.

**🔍 Minh chứng (Trace Logs):**
- **Trace 107:** Người dùng ra lệnh hủy chuyến xe: *"thôi, tôi ở nhà ăn cái gì đó v"*. Agent nhận diện đúng và đẩy task `ride` vào danh sách `discarded_task_refs`.
- **Trace 164 & 185:** Khi người dùng chuyển sang bàn về đồ ăn tối, Agent vẫn lẩm bẩm trong lý luận (reasoning): *"Task 0 (ride) was already completed/processed previously, so it remains in conversation history"*.
- **Trace 262:** Khi người dùng hỏi chitchat toán học *"1 + 1 bằng mấy?"*, Agent lại phân tích: *"Since there is an active ride task in progress... preserving task 0"*.

**⚠️ Nguyên nhân gốc rễ:**
- Gateway không thực sự pop/delete (xóa hoặc vô hiệu hóa) các Task ID nằm trong mảng `discarded_task_refs` khỏi cơ sở dữ liệu `conversation_states`.
- Hệ thống bê nguyên xi cục lịch sử JSONB (chứa cả task rác đã hủy) nạp ngược vào Prompt Context của LLM ở những lượt chat kế tiếp, khiến LLM lầm tưởng người dùng vẫn đang đợi xe.

**✅ Cách giải quyết:**
1. **Can thiệp Gateway:** Gateway BẮT BUỘC phải dọn dẹp biến `conversation_state.tasks` trước khi lưu vào DB. Những task nào bị LLM đánh dấu `discarded` thì phải xóa hẳn hoặc đổi trạng thái thành `inactive` để không nạp vào Prompt nữa.
2. **Layered Memory:** Chuyển đổi từ việc lưu JSONB khổng lồ sang mô hình bộ nhớ phân lớp (Working memory cho task hiện tại, Episodic memory cho lịch sử).

---

## 2. LỖI LẬP KẾ HOẠCH & VÒNG LẶP HỎI VÒNG VÈO

**🔴 Vấn đề:**
Luồng đặt đồ ăn bị cứng nhắc. Hệ thống liên tục hỏi vặn lại người dùng để lấy một thông tin cố định thay vì chủ động gọi Tool để đưa ra gợi ý, gây ra vòng lặp vô tận (Endless Clarification Loop).

**🔍 Minh chứng (Trace Logs):**
- **Trace 114:** Người dùng hỏi *"um có món gì ngon cạnh nhà không"*. Agent đáp: *"Bạn muốn tìm món ăn cụ thể nào..."*.
- **Trace 121:** Người dùng bực mình bảo *"bạn gợi ý đi"*. Agent lại tiếp tục: *"Bạn muốn ăn món gì cụ thể..."*.

**⚠️ Nguyên nhân gốc rễ:**
- CoreAPlanner bị khóa cứng vào quy tắc: "Task Food bắt buộc phải có slot `dish_query` (tên món ăn) thì mới được đổi trạng thái sang READY để gọi Tool".
- Vì thiếu tên món, Planner liên tục đặt trạng thái `needs_clarification = True`, khiến Gateway không bao giờ kích hoạt tool `food.search_nearby`.

**✅ Cách giải quyết:**
- **Nới lỏng ràng buộc Tool Mapping:** Cập nhật `XONE_SYSTEM_PROMPT`. Dạy Planner rằng tool `food.search` có thể được kích hoạt dựa trên bán kính `location` (ví dụ: gợi ý món ăn xung quanh) mà không nhất thiết phải bắt buộc có `dish_query`.

---

## 3. LỖI ẢO GIÁC (HALLUCINATION) & TỰ BỊA TRẠNG THÁI

**🔴 Vấn đề:**
LLM tự động bịa ra danh sách thực đơn, nhà hàng hoặc tệ hơn là bịa ra trạng thái vận chuyển đơn hàng dù hệ thống chưa hề thao tác với cơ sở dữ liệu.

**🔍 Minh chứng (Trace Logs):**
- **Trace 144:** Người dùng chốt món bún chả và hỏi *"bao giờ giao tới"*. Agent trả lời ngay: *"Đơn hàng bún chả của bạn đang được chuẩn bị và sẽ sớm được giao đến nhà bạn nhé!"* (Dù người dùng chưa hề chọn quán, chưa xem giá và chưa thanh toán).
- **Trace 5:** Hệ thống tìm kiếm cơm tấm thất bại (Authoritative results = rỗng), LLM tự bịa ra: *"Mình có bún chả, phở, mì cay..."*.

**⚠️ Nguyên nhân gốc rễ:**
- Đặc tính **Helpfulness Bias** của LLM. Khi Gateway ném vào một kết quả rỗng `[]` (hoặc khi chưa kích hoạt Tool Booking), LLM vẫn muốn "giúp đỡ" bằng cách dùng trí nhớ mặc định để tự sinh ra câu trả lời có vẻ hợp lý.
- Thiếu **Negative Constraint** (ràng buộc cấm) trong bước sinh ngôn ngữ (Composer).

**✅ Cách giải quyết:**
- Thêm Guardrail (Rào chắn) vào `COMPOSE_INSTRUCTION`: *"CRITICAL RULE: Nếu hệ thống chưa trả về `order_id` hoặc trạng thái xác nhận từ Tool, tuyệt đối KHÔNG ĐƯỢC báo cáo rằng đơn hàng đang được chuẩn bị. Nếu `authoritative_results` rỗng, bắt buộc phải báo lỗi, không tự bịa món ăn."*

---

## 4. LỖI ĐỨT GÃY LUỒNG THANH TOÁN (LỖI "CHƯA THỂ HOÀN TẤT")

**🔴 Vấn đề:**
Khi người dùng duyệt xong danh sách quán, bấm nút "Đặt hàng" trên giao diện (UI Giai đoạn 4), hệ thống văng lỗi *"Mình chưa thể hoàn tất lựa chọn này. Bạn thử lại với thông tin hiện tại nhé."* và luồng bị đứt gãy.

**🔍 Minh chứng:**
Hành vi lỗi trên App thực tế khi tương tác giao diện để tiến tới bước Giỏ hàng/Thanh toán.

**⚠️ Nguyên nhân gốc rễ:**
- **Mất Reference UUID (ID Ẩn):** Agent giao tiếp bằng chữ ("Quán số 1"), nhưng Database cần UUID. Khi user bấm chọn, Agent không thể ánh xạ text sang UUID, dẫn đến Gateway gọi Tool bị thiếu ID nhà hàng/món ăn.
- **Bypass UI vào luồng NLP:** Khi user bấm nút trên App, thao tác này lại bị chuyển thành Text và ném qua Agent Planner xử lý. LLM không có Payload (giỏ hàng, đơn giá) để xử lý bước tiếp theo.
- **Micro-tasking quá tải:** Việc bắt LLM phải duy trì máy trạng thái (State Machine) qua 4 bước: `create_cart` -> `add_item` -> `quote` -> `order` là quá sức đối với bộ nhớ ngữ cảnh hữu hạn.

**✅ Cách giải quyết:**
1. **Tách biệt UI và NLP:** Khi tương tác chạm vào UI (chọn món, bấm đặt hàng), App phải gọi thẳng API Gateway (`POST /cart/checkout`) kèm theo Payload rõ ràng. Gateway xử lý và lưu State, không bắt Agent Planner phải "đoán" ý định đặt hàng. Agent lúc này chỉ làm nhiệm vụ thông báo (Composer).
2. **Sử dụng Macro-Tools:** Gom các tool vụn vặt lại. Thay vì nhiều step tạo giỏ hàng, viết một tool duy nhất `food.checkout.prepare` xử lý trọn gói đầu vào, giảm tải cho LLM.
3. **Reference Mapping:** Gateway phải lưu ngầm bảng ánh xạ (VD: Option 1 = UUID_xyz) và truyền vào prompt để LLM truy xuất chính xác khi người dùng chat "Tôi lấy món số 1".

---

## 5. ĐÁNH GIÁ VÀ TRẠNG THÁI TRIỂN KHAI THỰC TẾ (EVALUATION & STATUS)

Dựa trên việc phân tích mã nguồn thực tế của hệ thống X-One (NestJS Gateway và FastAPI Agent), dưới đây là đánh giá mức độ phù hợp và trạng thái áp dụng của các giải pháp trên:

**Đánh giá tổng quan:** Các giải pháp nâng cấp được đề xuất là **cực kỳ phù hợp** và bám sát chính xác các lỗ hổng kiến trúc hiện tại. Tuy nhiên, hầu hết các giải pháp này **chưa được triển khai hoàn chỉnh** trong mã nguồn.

**Chi tiết trạng thái (Lý do cần thay đổi):**
1. **Quản lý trạng thái (Bóng ma task cũ):** *Chưa triệt để.* Ở bước sinh câu trả lời (`_compose_response`), Agent đã có đoạn code lọc bỏ các task `FAILED/DISCARDED`. Tuy nhiên, ở bước lập kế hoạch (`CoreAPlanner`), toàn bộ lịch sử task cũ từ DB (JSONB) vẫn bị nhồi nguyên vẹn vào Context của LLM, khiến LLM bị nhiễu. Việc dọn dẹp triệt để tại Gateway là lý do bắt buộc để giải quyết lỗi này.
2. **Lỗi lập kế hoạch (Vòng lặp hỏi vòng vèo):** *Chưa triển khai.* System Prompt hiện tại (`assistant_graph.py` dòng 111) vẫn đang bị khóa cứng bởi quy tắc: `food requires dish_query`. Đây là lý do Agent không chịu gọi Tool gợi ý nhà hàng nếu user không cung cấp tên món. Cần nới lỏng ràng buộc này để tăng tính linh hoạt.
3. **Lỗi ảo giác (Hallucination):** *Chưa triển khai.* Khối lệnh `COMPOSE_INSTRUCTION` hiện tại hoàn toàn thiếu rào chắn phủ định (Negative Constraint) khi mảng dữ liệu `authoritative_results` bị rỗng. Đây là lý do chính khiến LLM tự ý dùng kiến thức cá nhân để "bịa" ra menu.
4. **Lỗi đứt gãy thanh toán (Bypass UI):** *Đang xung đột kiến trúc.* Hiện tại Gateway đã mở sẵn các API endpoint trực tiếp (`POST /cart`, `POST /orders/preview`), nhưng Agent Registry lại vẫn đang ôm đồm các Micro-tools (`create_cart`, `add_cart_item`). Lý do cần thay đổi là LLM không thể duy trì độ chính xác của UUID qua nhiều turn chat; cần chuyển sang Macro-tools và đẩy toàn bộ logic State Machine về phía API Gateway.
