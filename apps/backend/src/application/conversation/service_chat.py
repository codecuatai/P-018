"""Tool-free conversation for users planning or discussing NaviGo services."""

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from src.contracts.chat import AgentAction, AgentReply


SYSTEM_PROMPT = """You are NaviGo's Vietnamese service-conversation workflow.
You can discuss booking services and help users decide what information they
need before requesting a service. Ride is currently the only connected live
domain. Hotel, clinic, and food services may be discussed but have no live API
yet.

Do not claim live prices, availability, drivers, bookings, policies, or payment
status. Do not create, cancel, or confirm a booking. If live data is needed,
explain what information is needed and invite the user to explicitly request a
quote, booking, or status. Keep the response friendly and practical.
"""


class ServiceConversationWorkflow:
    """In-scope advice/planning agent with no domain tools."""

    social_terms = ("xin chào", "chào", "hello", "hi", "cảm ơn", "cam on", "tạm biệt", "bye")

    def __init__(self, llm: BaseChatModel | None = None):
        self.llm = llm

    async def handle(self, message: str) -> AgentReply:
        normalized = message.lower().strip()
        if any(term in normalized for term in self.social_terms):
            return AgentReply(
                response="Chào bạn! Mình là NaviGo. Mình có thể tư vấn dịch vụ hoặc hỗ trợ báo giá, đặt và theo dõi chuyến xe khi bạn cần.",
                action=AgentAction.HELP,
            )
        fallback = self._fallback(message)
        if self.llm is None:
            return fallback
        try:
            answer = await self.llm.ainvoke([SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=message)])
            text = answer.content.strip() if isinstance(answer.content, str) else str(answer.content).strip()
            if text:
                return AgentReply(response=text, action=AgentAction.HELP)
        except Exception:
            pass
        return fallback

    @staticmethod
    def _fallback(message: str) -> AgentReply:
        normalized = message.lower()
        if any(term in normalized for term in ("đi chơi", "du lịch", "lịch trình", "địa điểm", "cuối tuần", "tối nay", "hẹn hò")):
            text = "Nghe hay đấy! Mình có thể giúp bạn lên kế hoạch. Bạn đang ở khu vực nào, đi mấy người và muốn ưu tiên không gian, thời gian di chuyển hay ngân sách?"
        elif any(term in normalized for term in ("khách sạn", "hotel", "phòng", "lưu trú")):
            text = "Mình có thể tiếp nhận nhu cầu lưu trú, nhưng Hotel Service chưa được kết nối nên chưa thể tra giá hoặc giữ phòng."
        elif any(term in normalized for term in ("khám", "bác sĩ", "bệnh viện", "phòng khám")):
            text = "Mình có thể hỗ trợ luồng đặt lịch khám khi Clinic Service được kết nối. Hiện chưa có lịch bác sĩ hoặc khung giờ thật để tra cứu."
        elif any(term in normalized for term in ("đồ ăn", "đặt món", "nhà hàng", "food")):
            text = "Food Service chưa được kết nối, vì vậy mình chưa thể hiển thị quán, thực đơn hoặc tạo đơn món ăn."
        elif any(term in normalized for term in ("xe máy", "xe 4", "xe 7", "loại xe", "di chuyển")):
            text = "Mình có thể tư vấn loại xe. Xe máy hợp với một người ít hành lý; xe 4 chỗ phù hợp nhóm nhỏ hoặc hành lý; xe 7 chỗ phù hợp nhóm đông. Khi bạn muốn giá thật, hãy cho điểm đón và điểm đến."
        elif any(term in normalized for term in ("thanh toán", "payment", "hoàn tiền", "hủy")):
            text = "Mình có thể hỗ trợ quy trình dịch vụ, nhưng chỉ kiểm tra hoặc thay đổi thanh toán khi có booking thật và yêu cầu rõ ràng của bạn."
        else:
            text = "Mình hỗ trợ các dịch vụ di chuyển, lưu trú, đặt lịch khám và đồ ăn. Hiện Ride Service đã kết nối; bạn có thể hỏi tư vấn hoặc yêu cầu báo giá xe khi sẵn sàng."
        return AgentReply(response=text, action=AgentAction.HELP)





