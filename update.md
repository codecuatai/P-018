# BÁO CÁO ĐÁNH GIÁ VÀ TÁI CẤU TRÚC KIẾN TRÚC X-ONE AGENT
*(Tổng hợp từ Phân tích Log Trace, Mã nguồn Orchestration và Cấu trúc Bộ nhớ)*

Tài liệu này trình bày phân tích chuyên sâu về các lỗ hổng kiến trúc hiện tại của hệ thống X-One, dẫn đến tình trạng suy luận kém, mất ngữ cảnh và sinh ảo giác (hallucination). Dựa trên phân tích 100 trace log thực tế và đối chiếu trực tiếp với codebase (bao gồm Gateway và cấu trúc LangGraph của Agent), dưới đây là chi tiết các vấn đề và giải pháp khắc phục toàn diện.

---

## PHẦN 1: TẦNG QUẢN LÝ TRẠNG THÁI & BỘ NHỚ (STATE & MEMORY MANAGEMENT)

### 1.1. Hiện trạng và Điểm yếu Hệ thống
Theo bằng chứng từ codebase (file `migration` dòng 28 và `assistant.service.ts` dòng 1157), Core đang lưu toàn bộ messages và state trong một cột JSONB duy nhất (`conversation_states`). Gateway giới hạn gửi tối đa 20 message gần nhất cho Agent. 

**Biểu hiện lỗi qua Log:**
- **Rò rỉ ngữ cảnh (Context Leak):** Trong Trace 13, khi đang xử lý yêu cầu tìm chuyến xe từ Đại học Thủy Lợi, Agent vẫn lưu giữ một "task healthcare cũ" trong bộ nhớ. 
- **Lặp từ máy móc:** Trace 1 cho thấy hệ thống thiếu logic fallback khi `saved_addresses` rỗng, dẫn đến phản hồi ngô nghê: *"Mình sẽ giúp bạn tìm phở bò giao về nhà nhé. Bạn muốn mình giao đến địa chỉ nào?"* [cite: 1787651635237-lf-events-export-cmso4085y03ghad0dxeiv8az3.csv].
- **Thiếu Semantic Memory:** Hệ thống hiện chỉ có *Working memory* (task đang hoạt động) mà không có bộ nhớ dài hạn. `conversation_summary` hiện tại quá nghèo nàn, không lưu trữ được sở thích hay thói quen đã được xác nhận.

### 1.2. Phân tích Nguyên nhân
Vấn đề không nằm ở việc "Agent không lưu lịch sử", mà là **cách lưu trữ lịch sử dưới dạng JSONB khổng lồ thiếu cấu trúc**. Việc không có cơ chế phân loại (phân biệt giữa dữ kiện tạm thời, sở thích lâu dài và thông tin xác thực) khiến LLM dễ bị nhiễu.

### 1.3. Giải pháp Tái cấu trúc
Cần thay thế JSONB cục bộ bằng **Hệ thống Bộ nhớ Phân lớp (Layered Memory)**. Tận dụng các hệ quản trị CSDL quan hệ kết hợp với cơ sở dữ liệu vector (như Qdrant) để thiết lập luồng truy xuất chuẩn xác:

*   **Working memory (Gateway/Core):** Quản lý task đang xử lý, slot thiếu, action chờ xác nhận.
*   **Episodic memory (Core):** Những sự kiện đã xảy ra, quyết định, điều chỉnh (ví dụ: "Lần trước tôi chọn quán này").
*   **Semantic user memory (Core + Qdrant):** Sở thích ăn uống, thói quen (chỉ lưu sau khi có độ tin cậy `confidence` cao).
*   **Authoritative facts (Domain Service):** Dữ kiện tuyệt đối (giá, booking_id). TUYỆT ĐỐI KHÔNG để Agent tự lưu và tự suy luận.

**Đề xuất Schema Core Database:**
- `conversation_turns`: Lưu rành mạch từng lượt (sequence_no, role, content).
- `memory_items`: Bảng cốt lõi chứa `key`, `typed_value`, `confidence`, `valid_until` và `supersedes_id` (để xử lý xung đột thông tin).

---

## PHẦN 2: TẦNG ĐỊNH TUYẾN & LẬP KẾ HOẠCH (PLANNING & ORCHESTRATION)

### 2.1. Hiện trạng và Điểm yếu Hệ thống
Khi đi sâu vào file `apps/agent-service/src/agents/assistant_graph.py`, luồng phối hợp giữa CoreAPlanner và Gateway lộ rõ điểm yếu về **Tool Mapping**. 

**Biểu hiện lỗi:** Khi người dùng hỏi *"Cho tôi xem menu của quán Phở Thìn"*, hệ thống không xử lý được, trả về lỗi rỗng hoặc bị điều hướng sai.

### 2.2. Phân tích Nguyên nhân
Trong `XONE_SYSTEM_PROMPT` (dòng 81-86), `domain: food` chỉ được hướng dẫn 3 tác vụ: *tìm quán ăn, chọn món, địa chỉ giao*. Planner hoàn toàn **mù mờ về công cụ xem menu**. 
Khi gặp câu hỏi này, Planner thường đưa ra 2 quyết định sai lầm:
1. Gán ép `dish_query = "menu quán Phở Thìn"`.
2. Phân loại câu hỏi thành `interaction_mode = "advisory"` (tư vấn chung).
Hậu quả nghiêm trọng là Gateway sẽ bypass (bỏ qua) việc gọi tool (như `food.list_menu`), dẫn đến việc cấp cho Agent một mảng `authoritative_results: []` trống rỗng.

### 2.3. Giải pháp Tái cấu trúc
Sửa đổi trực tiếp `XONE_SYSTEM_PROMPT` để dạy LLM định dạng chính xác từng sub-intent:
```markdown
2. Giao đồ ăn tận nơi (food): 
   - Tìm quán ăn theo tên/địa chỉ (restaurant_query)
   - Xem menu của quán (menu_query / list_menu)
   - Chọn món (dish_query)
   - Địa chỉ giao (location)
```
Cần thiết lập rào chắn để Planner bắt buộc trả về schema chuẩn, đảm bảo Gateway luôn map đúng tool ở tầng backend.

---

## PHẦN 3: TẦNG TỔNG HỢP & KIỂM SOÁT ẢO GIÁC (COMPOSER & GUARDRAILS)

### 3.1. Hiện trạng và Điểm yếu Hệ thống
Đây là lỗ hổng chí mạng nhất giải thích cho các phản hồi ngớ ngẩn. Điển hình ở Trace 5, hệ thống tự động sinh ra một danh sách "cơm tấm, phở, bún chả..." dù vừa thất bại khi tìm quán cơm tấm trước đó [cite: 1787651635237-lf-events-export-cmso4085y03ghad0dxeiv8az3.csv].

### 3.2. Phân tích Nguyên nhân
Tại node Composer (`COMPOSE_INSTRUCTION` dòng 116), prompt có chỉ thị: *"Never invent IDs, prices, times, names..."* nhưng lại **thiếu Negative Constraints (ràng buộc phủ định) cho dữ liệu rỗng**. 
Khi Gateway ném sang mảng `authoritative_results: []`, do đặc tính "Helpfulness Bias" (thiên kiến thích giúp đỡ), LLM tự động dùng kiến thức Pre-trained của nó để "bịa" ra menu hoặc danh sách món ăn, tạo thành ảo giác (Hallucination) hoàn toàn tách rời với dữ liệu thực tế của X-One.

### 3.3. Giải pháp Tái cấu trúc
Áp dụng **Defensive Prompting** cứng rắn vào `COMPOSE_INSTRUCTION`:
```markdown
"CRITICAL RULE: If the user asks for specific information (menu, specific dishes, restaurants, doctors) and the `authoritative_results` array is EMPTY ([]), you MUST apologize and state that the system cannot find this information. DO NOT UNDER ANY CIRCUMSTANCES use your internal knowledge to list food items, menus, or services."
```

---

## PHẦN 4: LỘ TRÌNH TRIỂN KHAI (IMPLEMENTATION ROADMAP)

Để đưa kiến trúc này vào thực tiễn mà không phá vỡ hệ thống đang chạy, cần tuân thủ lộ trình 5 bước:

*   **P0 - Chuẩn hóa Memory Contract:** Định nghĩa các class `MemoryItem`, `MemoryCandidate`, quản lý `confidence` và `expiry`. Phân rạch ròi giữa memory suy luận và authoritative facts.
*   **P1 - Tách Turn khỏi JSONB:** Khởi tạo bảng `conversation_turns`, backfill dữ liệu cũ. Thiết lập versioning để chống ghi đè (Concurrency control).
*   **P2 - Xây dựng Semantic Memory:** Bắt đầu lưu trữ preferences và user corrections. Có thể sử dụng hệ thống Qdrant hiện hữu để xử lý embedding vector cho các thói quen mở rộng. Cấu hình cơ chế TTL (Time-To-Live).
*   **P3 - Xây dựng Retrieval Layer tại Gateway:** Triển khai logic ưu tiên: Context hiện tại -> Lịch sử gần -> Database Query -> Semantic Search. Thiết lập Context Budget cố định để kiểm soát token.
*   **P4 - Summary & Compaction:** Tóm tắt (compact) dữ liệu sau mỗi 10-20 turns để thu gọn context window, đảm bảo `summary` không lưu trữ lầm các dữ liệu thay đổi liên tục như trạng thái đơn hàng.
*   **P5 - Đánh giá (Hardening):** Đo lường Retrieval precision/recall, tỷ lệ rò rỉ context, và độ trễ hệ thống (hiện đang ở mức trung bình 1.8s) [cite: 1787651635237-lf-events-export-cmso4085y03ghad0dxeiv8az3.csv].