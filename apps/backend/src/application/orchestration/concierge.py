"""One Concierge workflow that coordinates policy, routing, and domain workflows."""

from __future__ import annotations

from enum import StrEnum
from uuid import uuid4

from src.application.conversation.service_chat import ServiceConversationWorkflow
from src.application.domains.contracts import Domain
from src.application.domains.registry import WorkflowRegistry, workflow_registry
from src.application.orchestration.scope_guard import ScopeGuard, ScopeKind
from src.contracts.chat import AgentAction, AgentReply
from src.infrastructure.llm.provider import get_llm


class ConciergeRoute(StrEnum):
    RIDE = "ride"
    FOOD = "food"
    HOTEL = "hotel"
    CLINIC = "clinic"
    SERVICE_CONVERSATION = "service_conversation"
    OUT_OF_SCOPE = "out_of_scope"


class ConciergeWorkflow:
    """Single runtime workflow; domains are adapters, not peer AI agents."""

    def __init__(
        self,
        registry: WorkflowRegistry | None = None,
        conversation: ServiceConversationWorkflow | None = None,
        scope_guard: ScopeGuard | None = None,
    ):
        self.registry = registry or workflow_registry
        self.conversation = conversation or ServiceConversationWorkflow()
        self.scope_guard = scope_guard or ScopeGuard()

    @staticmethod
    def session_id(value: str | None) -> str:
        return value or str(uuid4())

    def route(self, message: str, session_id: str, scope: ScopeKind) -> ConciergeRoute:
        if scope is ScopeKind.SENSITIVE or scope is ScopeKind.OUTSIDE:
            return ConciergeRoute.OUT_OF_SCOPE
        workflow = self.registry.resolve(message, session_id)
        if workflow is None:
            return ConciergeRoute.SERVICE_CONVERSATION
        return ConciergeRoute(workflow.domain.value)

    async def run_domain(self, domain: Domain, message: str, session_id: str) -> tuple[str, AgentReply]:
        return await self.registry.get(domain).handle(message, session_id)

    async def run_conversation(self, message: str) -> AgentReply:
        return await self.conversation.handle(message)

    @staticmethod
    def out_of_scope_reply(scope: ScopeKind) -> AgentReply:
        if scope is ScopeKind.SENSITIVE:
            response = (
                "Mình không thể cung cấp hướng dẫn nội bộ, thông tin bảo mật hoặc hỗ trợ vượt qua các quy tắc. "
                "Nếu bạn đang chuẩn bị một chuyến đi, mình rất sẵn lòng giúp tư vấn và đặt dịch vụ của NaviGo."
            )
        else:
            response = (
                "Mình chuyên hỗ trợ lên kế hoạch và sử dụng các dịch vụ của NaviGo như di chuyển, lưu trú, lịch khám và đồ ăn. "
                "Nếu bạn sắp đi đâu đó, hãy nói khu vực, thời gian hoặc nhu cầu của bạn nhé."
            )
        return AgentReply(response=response, action=AgentAction.HELP)


_default_llm = get_llm()
concierge = ConciergeWorkflow(
    conversation=ServiceConversationWorkflow(_default_llm),
    scope_guard=ScopeGuard(_default_llm),
)
