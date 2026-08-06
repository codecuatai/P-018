import pytest
from src.application.domains.ride.workflow import RideWorkflow
from src.infrastructure.memory.session_store import ConversationStore
from src.contracts.chat import AgentAction
from src.application.domains.ride.contracts import BookingSummary, QuoteSummary


class FakeRideClient:
    def __init__(self):
        self.quote_requests = []
        self.booking_requests = []

    async def create_live_quote(self, request):
        self.quote_requests.append(request)
        return QuoteSummary(
            id="quote_demo",
            amount=52_000,
            distance_km=5,
            duration_minutes=16,
            pickup_address=request.pickup_address,
            dropoff_address=request.dropoff_address,
        )

    async def create_booking(self, request, idempotency_key=None):
        self.booking_requests.append(request)
        return BookingSummary(
            id="ride_demo",
            quote_id=request.quote_id,
            amount=52_000,
            authorized_amount=62_400,
            status="DRIVER_ASSIGNED",
            driver_eta_seconds=240,
        )

    async def get_booking(self, booking_id):
        return BookingSummary(
            id=booking_id, quote_id="quote_demo", amount=52_000, status="DRIVER_ASSIGNED", driver_eta_seconds=240
        )

    async def cancel_booking(self, booking_id, idempotency_key=None):
        return BookingSummary(id=booking_id, quote_id="quote_demo", amount=52_000, status="CANCELLED")

    async def complete_booking(self, booking_id, idempotency_key=None):
        return BookingSummary(id=booking_id, quote_id="quote_demo", amount=52_000, status="PAID")


@pytest.mark.asyncio
async def test_agent_collects_missing_location_then_books(monkeypatch):
    client = FakeRideClient()
    concierge = RideWorkflow(client, ConversationStore())
    concierge.llm = None

    session_id, missing = await concierge.handle("Báo giá xe cho mình")
    assert missing.action == AgentAction.CLARIFY
    assert set(missing.missing_fields) == {"điểm đón", "điểm đến"}

    _, quote = await concierge.handle("Đi từ VinUni đến Hồ Gươm", session_id)
    assert quote.action == AgentAction.QUOTE
    assert client.quote_requests[0].pickup_address == "VinUni"
    assert client.quote_requests[0].dropoff_address == "Hồ Gươm"

    _, booked = await concierge.handle("Xác nhận đặt xe", session_id)
    assert booked.action == AgentAction.BOOK
    assert booked.data["id"] == "ride_demo"


@pytest.mark.asyncio
async def test_agent_fetches_latest_booking_status():
    concierge = RideWorkflow(FakeRideClient(), ConversationStore())
    concierge.llm = None
    session_id, _ = await concierge.handle("Đi từ VinUni đến Hồ Gươm")
    await concierge.handle("đặt xe", session_id)

    _, status = await concierge.handle("cập nhật tình trạng chuyến", session_id)
    assert status.action == AgentAction.STATUS
    assert status.data["status"] == "DRIVER_ASSIGNED"


@pytest.mark.asyncio
async def test_agent_collects_pickup_and_dropoff_in_separate_turns():
    client = FakeRideClient()
    concierge = RideWorkflow(client, ConversationStore())
    concierge.llm = None

    session_id, first = await concierge.handle("Tôi muốn gọi xe")
    assert first.action == AgentAction.CLARIFY
    assert set(first.missing_fields) == {"điểm đón", "điểm đến"}

    _, second = await concierge.handle("đón tại VinUni", session_id)
    assert second.action == AgentAction.CLARIFY
    assert second.missing_fields == ["điểm đến"]

    _, quote = await concierge.handle("đến Hồ Gươm", session_id)
    assert quote.action == AgentAction.QUOTE
    assert client.quote_requests[0].pickup_address == "VinUni"
    assert client.quote_requests[0].dropoff_address == "Hồ Gươm"


@pytest.mark.asyncio
async def test_greeting_does_not_call_ride_tool():
    client = FakeRideClient()
    concierge = RideWorkflow(client, ConversationStore())
    concierge.llm = None

    session_id, reply = await concierge.handle("Xin chào")

    assert reply.action == AgentAction.HELP
    assert client.quote_requests == []
    snapshot = concierge.store._sessions[session_id]
    assert [turn["role"] for turn in snapshot.history] == ["user", "assistant"]


@pytest.mark.asyncio
async def test_bare_follow_up_location_completes_draft():
    client = FakeRideClient()
    concierge = RideWorkflow(client, ConversationStore())
    concierge.llm = None

    session_id, first = await concierge.handle("đón tại VinUni")
    assert first.missing_fields == ["điểm đến"]

    _, quote = await concierge.handle("Hồ Gươm", session_id)
    assert quote.action == AgentAction.QUOTE
    assert client.quote_requests[0].pickup_address == "VinUni"
    assert client.quote_requests[0].dropoff_address == "Hồ Gươm"


@pytest.mark.asyncio
async def test_here_is_not_treated_as_a_concrete_pickup_location():
    concierge = RideWorkflow(FakeRideClient(), ConversationStore())
    concierge.llm = None

    _, reply = await concierge.handle("đi từ đây ra Ngã Tư Sở")

    assert reply.action == AgentAction.CLARIFY
    assert reply.missing_fields == ["điểm đón"]
    assert "vị trí" in reply.response



class UnreachableRideClient(FakeRideClient):
    async def create_live_quote(self, request):
        from src.infrastructure.clients.ride_client import RideApiError
        raise RideApiError("Không kết nối được tới Ride Service.", code="ride_service_unreachable")


@pytest.mark.asyncio
async def test_agent_returns_connection_diagnostic_without_persisting_error():
    concierge = RideWorkflow(UnreachableRideClient(), ConversationStore())
    concierge.llm = None

    _, reply = await concierge.handle("Đi từ VinUni đến Hồ Gươm")

    assert reply.action == AgentAction.ERROR
    assert reply.data["error"]["code"] == "ride_service_unreachable"
    assert reply.data["error"]["service"] == "ride"
    assert "Mã lỗi" in reply.response




@pytest.mark.asyncio
async def test_workflow_remembers_natural_language_destination_across_turns():
    client = FakeRideClient()
    workflow = RideWorkflow(client, ConversationStore())
    workflow.llm = None

    session_id, first = await workflow.handle("chán quá tôi muốn đi Hồ Gươm chơi đặt xe hộ tôi")
    assert first.action == AgentAction.CLARIFY
    assert first.missing_fields == ["điểm đón"]

    _, quote = await workflow.handle("đi từ đại học thủy lợi", session_id)
    assert quote.action == AgentAction.QUOTE
    assert client.quote_requests[0].pickup_address == "đại học thủy lợi"
    assert client.quote_requests[0].dropoff_address == "Hồ Gươm"
