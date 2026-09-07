# Dịch Vụ AI Agent (Agent Service)

Dịch vụ Agent đảm nhiệm vai trò phân tích ý định (intent classification), trích xuất thực thể ngữ nghĩa (entity extraction), lập kế hoạch hội thoại (conversation planning) và tổng hợp ngôn ngữ tự nhiên an toàn (safe language composition) trong hệ sinh thái X-One.

## 1. Nguyên Tắc & Ranh Giới Kiến Trúc

- **Đầu ra luôn là Untrusted**: Toàn bộ kết quả từ mô hình AI được coi là chưa tin cậy và bắt buộc phải đi qua các lớp kiểm tra schema Pydantic, bộ kiểm tra chính sách (policy check) và thẩm định nghiệp vụ tại API Gateway.
- **Tuyệt đối không gọi trực tiếp domain hay database**: Agent không sở hữu client gọi tới domain service, không có kết nối tới database của domain, không thể tự ý kích hoạt thanh toán hoặc tự chốt giao dịch.
- **Ranh giới công cụ chuẩn tắc (Tool Registry v2)**: Agent chỉ phát ra các đề xuất gọi công cụ (`ToolProposal`) dạng typed nằm trong danh mục công cụ đã được quản trị tại Gateway.
- **Bảo mật tuyệt đối thông tin giám sát (Observability)**: Tracing qua Langfuse v4 được cấu hình chỉ xuất metadata (thời gian chạy, tên capability, model latency, mã lỗi an toàn). Tuyệt đối không xuất prompt thô, tin nhắn người dùng, trạng thái đồ thị (graph state) hay thông tin cá nhân (PII).

## 2. Kiến Trúc Luồng Xử Lý (LangGraph Architecture)

Agent được xây dựng trên nền tảng LangGraph với các node xử lý chuyên biệt:
1. `InputGuardNode`: Kiểm tra an toàn đầu vào, phát hiện prompt injection hoặc ngôn từ độc hại.
2. `IntentClassifierNode`: Phân loại ý định của người dùng sang một hoặc nhiều domain (Food, Ride, Restaurant, Healthcare, hoặc Smalltalk).
3. `SlotExtractorNode`: Trích xuất các tham số nghiệp vụ cần thiết (địa điểm, thời gian, số khách, món ăn, triệu chứng bệnh).
4. `PlannerNode`: Lập đồ thị kế hoạch thực thi (DAG) các bước cần làm.
5. `CoreAHandoffNode`: Xuất đề xuất kế hoạch chuẩn định dạng `core-a.v1` sang cho API Gateway.
6. `ComposerNode`: Tổng hợp phản hồi ngôn ngữ tự nhiên bằng tiếng Việt điềm tĩnh, thân thiện dựa trên kết quả chính thức nhận được từ Gateway.

## 3. Chế Độ Hoạt Động (Model Modes)

Cấu hình qua biến môi trường `AGENT_MODEL_MODE`:
- `gemini`: Sử dụng mô hình Google Gemini thực tế (`gemini-2.5-flash`). Yêu cầu cấu hình `GEMINI_API_KEY` (hoặc danh sách nhiều khóa `GEMINI_API_KEYS` để tự động cân bằng tải Round Robin và chống lỗi giới hạn hạn mức 429).
- `deterministic`: Chế độ lập kế hoạch tất định offline bằng quy tắc (rule-based). Đây là chế độ mặc định khi chưa cấu hình API key, đảm bảo môi trường phát triển cục bộ và bộ kiểm thử chạy ổn định không phụ thuộc mạng bên ngoài.

## 4. Kiểm Thử Cục Bộ

```bash
pytest apps/agent-service/tests -q
```
