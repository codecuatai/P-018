# Danh Sách Các Vấn Đề Phát Sinh Từ Log Cần Khắc Phục (fix.md)

---

## 1. Lỗi Task trạng thái cũ không bị hủy triệt để gây rò rỉ ngữ cảnh (Multi-Task State Leakage)

### Mô tả vấn đề
Trong luồng hội thoại đa bước:
1. Người dùng ban đầu thực hiện đặt xe (*"Đặt xe từ VinUni đến Hồ Gươm bằng xe 4 chỗ"*), hệ thống tạo `Task 0 (domain: ride, phase: IN_PROGRESS)`.
2. Sau đó người dùng yêu cầu hủy (*"hủy chuyến xe vừa rồi cho tôi"*).
3. Người dùng chuyển sang hỏi đặt nhà hàng và tìm đồ ăn (*"gợi ý cho tôi món ăn quanh khu vực VinUni"*, *"món ăn gì cũng được"*), hệ thống tạo `Task 2 (domain: food, phase: IN_PROGRESS)`.
4. Tuy nhiên, `Task 0 (ride)` không được cập nhật sang trạng thái `CANCELLED` hoặc `DISCARDED` mà vẫn giữ nguyên `phase: IN_PROGRESS` trong `conversation_state`.
5. Khi người dùng nhắn tin tiếp theo về đồ ăn, ở chế độ `compose`, Gateway gửi cả 2 tasks đang `IN_PROGRESS` sang cho Agent, khiến LLM tổng hợp phản hồi cho cả 2 tác vụ cùng lúc:
   > *"Dạ, em đã ghi nhận yêu cầu đặt ô tô 4 chỗ từ VinUni đi Hồ Gươm của bạn rồi nhé. Tuy nhiên, về phần tìm quán ăn quanh khu vực VinUni... Còn cuốc xe thì mình tiếp tục nhé?"*

### Bằng chứng từ Trace Log
- **Trace ID:** `c5243540e8209cbc`, `917bea9665924214` (LangGraph)
- **`conversation_state` bị rò rỉ:**
  ```json
  {
    "working_memory": {
      "active_task_refs": [0, 2],
      "active_domains": ["ride", "food"],
      "workflow_phase": "IN_PROGRESS"
    },
    "tasks": [
      {
        "task_ref": 0,
        "domain": "ride",
        "goal": "Đặt ô tô 4 chỗ từ VinUni đến Hồ Gươm",
        "phase": "IN_PROGRESS"
      },
      {
        "task_ref": 2,
        "domain": "food",
        "goal": "Tìm quán ăn quanh khu vực VinUni",
        "phase": "IN_PROGRESS"
      }
    ]
  }
  ```

### Nguyên nhân gốc rễ (Root Cause)
- Khi xử lý intent hủy (`Operation.CANCEL` hoặc khi người dùng đổi ngữ cảnh chuyển hướng sang dịch vụ khác), Gateway / Agent chưa kích hoạt luồng đóng hoặc cập nhật `phase` của tác vụ cũ sang `DISCARDED` / `CANCELLED` trong bộ lưu trữ `conversation_state`.
- Dẫn đến việc `activeTasks` trong `plannerSafeState` lọc các task `['PLANNING', 'NEEDS_INFO', 'IN_PROGRESS', 'AWAITING_CONFIRMATION']` vẫn tiếp tục gom `Task 0` vào `working_memory.active_task_refs`.

### Phương án khắc phục (Action Items)
1. **Agent State Transitions:** Đảm bảo khi nhận diện yêu cầu hủy chuyến hoặc chuyển ngữ cảnh rõ ràng, `discarded_task_refs` hoặc lệnh hủy phải cập nhật dứt điểm phase của task tương ứng trong `conversation_state`.
2. **Gateway Task Management:** Trong `assistant.service.ts`, khi một workflow/task nhận lệnh hủy thành công hoặc bị loại bỏ, phải đồng bộ cập nhật state lưu trữ trong DB (`mergeConversationState`) để loại bỏ task đó khỏi danh sách active tasks.
3. **Thêm Test Case kiểm chứng:** Viết regression test cho kịch bản: Đặt xe -> Hủy xe -> Hỏi đặt món ăn -> Đảm bảo phản hồi chỉ tập trung vào món ăn và `working_memory.active_task_refs` chỉ còn chứa task món ăn.

---

## 2. Lỗi Hallucination danh sách Bác sĩ ngoài cơ sở dữ liệu (Healthcare Doctor Hallucination)

### Mô tả vấn đề
Trong phiên khám bệnh (`conv_a31ef8b2-b9c8-49ec-9705-39f91c4d9b4b`), người dùng đặt lịch khám răng và sau đó hỏi: *"còn bác sĩ nào khác không"*.
- Backend thực tế chỉ trả về 2 bác sĩ có sẵn trong chuyên khoa: *Trương Mạnh Nguyên* và *Vũ Thị Dịu*.
- Tuy nhiên mô hình LLM tự sinh (bịa thêm) tên các bác sĩ: *"bên mình còn có các bác sĩ khác như bác sĩ Nguyễn Văn An và bác sĩ Lê Thị Hoa cũng rất tận tâm"*.

### Bằng chứng từ Trace Log
- **Trace ID:** `0b2cb62952e99266` (StartTime: `2026-08-20 06:00:50`)
- **Assistant Message:**
  > *"Dạ, chuyên khoa Răng hàm mặt hiện có bác sĩ Trương Mạnh Nguyên và bác sĩ Vũ Thị Dịu. Ngoài ra, bên mình còn có các bác sĩ khác như bác sĩ Nguyễn Văn An và bác sĩ Lê Thị Hoa cũng rất tận tâm. Bạn muốn đặt lịch với bác sĩ nào không ạ?"*

### Nguyên nhân gốc rễ (Root Cause)
- Prompt chưa cấm triệt để việc hallucinate/bịa thêm thực thể (entity) khi người dùng hỏi các lựa chọn khác.
- Khi không tìm thấy thêm bác sĩ từ kết quả truy vấn thực tế, Agent cần thông báo rõ ràng là hiện chỉ có các bác sĩ trên thay vì tự sáng tạo thông tin.

### Phương án khắc phục (Action Items)
1. **Hardening Prompt / Grounding:** Siết chặt grounding rules trong `system_prompt`: Cấm tuyệt đối việc đề xuất tên bác sĩ, quán ăn, món ăn nếu không có trong `authoritative_results` hoặc `extracted_slots` được cung cấp.
2. **Healthcare Tool Parity:** Khi người dùng hỏi *"còn bác sĩ nào khác không"*, kích hoạt công cụ `healthcare.list_slots` hoặc `healthcare.list_departments` để truy vấn danh sách thực tế trước khi trả lời.

---

## 3. Lỗi trùng lặp mảng `pending_actions` trong Task State (Array Duplication Bug)

### Mô tả vấn đề
Trong `conversation_state.tasks[0]`, mảng `pending_actions` bị duplicate lặp lại cùng một action hàng chục lần.

### Bằng chứng từ Trace Log
- **Trace ID:** `0b2cb62952e99266`
- **Payload trích xuất:**
  ```json
  "pending_actions": [
    "healthcare_payment",
    "healthcare_cancel",
    "select_healthcare_slot",
    "select_healthcare_slot",
    "select_healthcare_slot",
    "select_healthcare_slot",
    "select_healthcare_slot",
    "select_healthcare_slot",
    "select_healthcare_slot",
    "select_healthcare_slot",
    "select_healthcare_slot",
    "select_healthcare_slot",
    "select_healthcare_slot"
  ]
  ```

### Nguyên nhân gốc rễ (Root Cause)
- Khi Gateway sinh `pending_actions` hoặc merge state qua các turn, logic `append` không kiểm tra `Set` / trùng lặp (duplicate), hoặc mỗi slot khả dụng được push thêm 1 phần tử `select_healthcare_slot` vào cùng một mảng mà không deduplicate.

### Phương án khắc phục (Action Items)
- Sử dụng `Array.from(new Set(pendingActions))` trong `assistant.service.ts` trước khi truyền vào `plannerSafeState` hoặc khi lưu state.

---

## 4. Lỗi Tìm kiếm Food thất bại khi người dùng yêu cầu món chung (Food Catalog Search Failure on General Queries)

### Mô tả vấn đề
Trong phiên tìm đồ ăn (`conv_257e93dc-6d34-4990-be59-027af4a19eed`):
1. Người dùng chọn món *"bánh mì đi"* -> *"giao trực tiếp cho tôi"* -> *"bánh mì gì cũng được 2 cái bánh mì nha"*.
2. Hệ thống bóc tách `dish_query: "bánh mì"`, `location: "Hà Nội"`, `delivery_preference: "home"`.
3. Tuy nhiên kết quả tìm kiếm thực tế trả về rỗng và Assistant thông báo: *"Dạ, mình chưa tìm thấy quán bánh mì nào phù hợp để giao tận nơi theo yêu cầu của bạn ở Hà Nội rồi..."*.

### Bằng chứng từ Trace Log
- **Trace ID:** `a339d1c1b1c8c9b2`, `f11b99fd8858d0d6`
- **Output:** `Assistant Message: Dạ, mình chưa tìm thấy quán bánh mì nào phù hợp để giao tận nơi...`

### Nguyên nhân gốc rễ (Root Cause)
- Bộ lọc `location` ("Hà Nội") trong `food-service` tìm kiếm theo exact match hoặc khoảng cách bán kính nhưng dataset mẫu của Food chỉ có các quán với địa chỉ chi tiết theo quận/huyện cụ thể (như Hoàn Kiếm, Cầu Giấy) hoặc chuỗi `location: "Hà Nội"` bị filter out vì quá rộng.
- Chưa có fallback fuzzy search cho từ khóa món ăn khi người dùng chỉ nhập tên thành phố chung chung.

### Phương án khắc phục (Action Items)
1. Cải tiến tìm kiếm món ăn tại `food-service`: Nếu `location` là tên tỉnh/thành phố chung ("Hà Nội", "TP HCM"), mở rộng tìm kiếm trên toàn bộ catalog thuộc thành phố đó thay vì lọc cứng chuỗi.
2. Thêm alias / fallback trong `location_aliases` cho domain Food.

---

## 5. Lỗi lặp lại câu hỏi làm rõ dù người dùng đã cung cấp đủ thông tin (Redundant Clarification Prompting)

### Mô tả vấn đề
- Ở `conv_257e93dc-6d34-4990-be59-027af4a19eed` (Trace ID `6ad6818c6dc01301`):
  - Người dùng đã trả lời *"giao trực tiếp cho tôi"* (đã xác định `delivery_preference: home`).
  - Planner đã gán `needs_clarification: False`.
  - Nhưng ở pha `compose`, Assistant vẫn tiếp tục hỏi: *"bạn có thể cho mình biết bạn muốn ăn loại bánh mì nào, số lượng bao nhiêu và quán cụ thể nào không ạ?"*, làm trải nghiệm người dùng bị kéo dài không cần thiết.

### Nguyên nhân gốc rễ (Root Cause)
- Khi task chuyển sang `IN_PROGRESS` nhưng chưa chọn được món cụ thể vào giỏ hàng (`cart`), prompt compose mặc định sinh câu hỏi tiếp mà không tự động chuyển sang hiển thị danh sách quán ăn tìm được kèm nút lựa chọn.

### Phương án khắc phục (Action Items)
- Khi `delivery_preference` đã có và đã tìm thấy danh sách món, Gateway cần đính kèm `items` danh sách gợi ý vào message để giao diện hiển thị thẻ chọn thay vì chỉ hỏi bằng text đơn thuần.

---
