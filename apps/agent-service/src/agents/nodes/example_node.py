# Force reload Agent Service to clear MemorySaver state
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from src.agents.state import AgentState
from src.agents.tools.medical_tools import medical_tools_list
from src.config import get_settings

settings = get_settings()

llm = ChatGoogleGenerativeAI(model=settings.model_name, api_key=settings.google_api_key)
llm_with_tools = llm.bind_tools(medical_tools_list)

SYSTEM_PROMPT = """Bạn là trợ lý y tế ảo AI Concierge của bệnh viện. Nhiệm vụ: Đặt lịch khám.
LUẬT TỐI THƯỢNG: KHÔNG ĐƯỢC TỰ BỊA DỮ LIỆU. BẮT BUỘC DÙNG TOOL LẦN LƯỢT THEO QUY TRÌNH!

Quy trình 5 bước:
1. Hỏi triệu chứng. Khi user trả lời, dùng tool `analyze_symptoms` để tìm chuyên khoa.
2. Dùng tool `get_available_slots` (truyền tên chuyên khoa) để xem bác sĩ và Slot ID rảnh. Đề xuất cho user chọn.
3. Khi user chọn giờ, NẾU có nhiều bác sĩ cùng trống giờ đó, BẮT BUỘC phải hỏi lại user muốn chọn bác sĩ nào. TUYỆT ĐỐI KHÔNG ĐƯỢC tự ý chọn hộ user.
4. Khi đã chắc chắn bác sĩ và Slot, dùng tool `hold_slot` để giữ chỗ (chỉ truyền slot_id và triệu chứng, ID bệnh nhân đã được liên kết tự động). Tool sẽ trả về trạng thái DRAFT.
   LÚC NÀY, bạn phải trả lời user và KÈM THEO khối JSON (nằm trong block ```json) như sau:
```json
{
  "type": "doctor_schedule",
  "data": {
    "doctorName": "<tên bác sĩ>",
    "price": <giá tiền>,
    "date": "<thời gian khám>",
    "status": "Draft",
    "appointmentId": <mã lịch hẹn>
  }
}
```
5. Yêu cầu user bấm nút "Thanh toán & Xác nhận" trên thẻ lịch khám để hoàn tất. AI không cần chờ một dòng mã bí mật nào cả. Khi user nhắn báo rằng họ đã thanh toán xong, BẠN HÃY GỌI LUÔN tool `confirm_booking` để kiểm tra.
   - Nếu tool trả về lỗi (chưa thanh toán), hãy nhắc nhở user phải bấm nút thanh toán thật sự trên màn hình.
   - Nếu tool trả về thành công, chúc mừng user và kết thúc luồng.
6. Nếu user yêu cầu hủy lịch hẹn, sử dụng tool `cancel_booking` (truyền mã lịch hẹn) để hủy bỏ.
"""

async def chatbot_node(state: AgentState) -> dict:
    messages = state.get("messages", [])
    query = state.get("query", "")
    
    new_messages = []
    
    # Khởi tạo system prompt nếu chưa có
    if not messages:
        sys_msg = SystemMessage(content=SYSTEM_PROMPT)
        messages = messages + [sys_msg]
        new_messages.append(sys_msg)
        
    # Xử lý input từ user (thông qua query)
    if query:
        human_msg = HumanMessage(content=query)
        messages = messages + [human_msg]
        new_messages.append(human_msg)

    response_msg = await llm_with_tools.ainvoke(messages)
    new_messages.append(response_msg)
    
    response_content = response_msg.content
    if isinstance(response_content, list):
        text_blocks = [b.get("text", "") for b in response_content if isinstance(b, dict) and "text" in b]
        response_content = " ".join(text_blocks)
    elif not isinstance(response_content, str):
        response_content = str(response_content)
        
    # Nếu có gọi tool thì response trả về rỗng để nhường cho tool xử lý
    response_text = response_content if not response_msg.tool_calls else ""
    
    # Return tất cả tin nhắn mới để lưu vào memory, và reset query
    return {"messages": new_messages, "response": response_text, "query": ""}
