import pytest
from src.agents.conversation import ConversationStore, RideConcierge
from src.models.conversation import AgentAction
from src.models.ride import BookingSummary, QuoteSummary


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
    concierge = RideConcierge(client, ConversationStore())
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
    concierge = RideConcierge(FakeRideClient(), ConversationStore())
    concierge.llm = None
    session_id, _ = await concierge.handle("Đi từ VinUni đến Hồ Gươm")
    await concierge.handle("đặt xe", session_id)

    _, status = await concierge.handle("cập nhật tình trạng chuyến", session_id)
    assert status.action == AgentAction.STATUS
    assert status.data["status"] == "DRIVER_ASSIGNED"


@pytest.mark.asyncio
async def test_agent_collects_pickup_and_dropoff_in_separate_turns():
    client = FakeRideClient()
    concierge = RideConcierge(client, ConversationStore())
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
    concierge = RideConcierge(client, ConversationStore())
    concierge.llm = None

    session_id, reply = await concierge.handle("Xin chào")

    assert reply.action == AgentAction.HELP
    assert client.quote_requests == []
    snapshot = concierge.store._sessions[session_id]
    assert [turn["role"] for turn in snapshot.history] == ["user", "assistant"]


@pytest.mark.asyncio
async def test_bare_follow_up_location_completes_draft():
    client = FakeRideClient()
    concierge = RideConcierge(client, ConversationStore())
    concierge.llm = None

    session_id, first = await concierge.handle("đón tại VinUni")
    assert first.missing_fields == ["điểm đến"]

    _, quote = await concierge.handle("Hồ Gươm", session_id)
    assert quote.action == AgentAction.QUOTE
    assert client.quote_requests[0].pickup_address == "VinUni"
    assert client.quote_requests[0].dropoff_address == "Hồ Gươm"


@pytest.mark.asyncio
async def test_here_is_not_treated_as_a_concrete_pickup_location():
    concierge = RideConcierge(FakeRideClient(), ConversationStore())
    concierge.llm = None

    _, reply = await concierge.handle("đi từ đây ra Ngã Tư Sở")

    assert reply.action == AgentAction.CLARIFY
    assert reply.missing_fields == ["điểm đón"]
    assert "vị trí" in reply.response
