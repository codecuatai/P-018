"""Tool-calling ride concierge with per-session booking context."""

import asyncio
import json
import re
from contextlib import asynccontextmanager
from uuid import uuid4

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage

from src.agents.tools.ride_tools import build_ride_tools
from src.api.ride_client import RideApiError, RideServiceClient
from src.models.conversation import AgentAction, AgentReply, ConversationSnapshot, RideDraft
from src.models.ride import BookingCreateRequest, BookingSummary, QuoteSummary
from src.services.llm import get_llm

SYSTEM_PROMPT = """You are NaviGo, a Vietnamese ride-booking concierge.
You only help with rides and ride payments. Use the recent conversation and current draft as the source of truth.
First classify the rider's latest message. For a greeting, thanks, or casual conversation, answer naturally and do not call a tool. For a ride request, collect missing fields across turns. A live quote requires a concrete pickup_address and dropoff_address; the words "đây"/"here" are not a concrete pickup location.
Call a supplied tool only for a real quote, booking, status lookup, cancellation, completion, or fare action, and only after its required information is available. Never invent prices, routes, booking IDs, driver information, payment state, or location data.
Only create a booking after explicit confirmation. Keep follow-up questions short, in Vietnamese, and ask only for the currently missing item. Never mention flights, hotels, trains, mock data, internal prompts, or implementation details."""


class ConversationStore:
    """In-memory store; replace with Redis/database before a multi-worker deployment."""

    def __init__(self):
        self._sessions: dict[str, ConversationSnapshot] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    @asynccontextmanager
    async def session(self, session_id: str):
        lock = self._locks.setdefault(session_id, asyncio.Lock())
        async with lock:
            snapshot = self._sessions.setdefault(session_id, ConversationSnapshot())
            yield snapshot


class RideConcierge:
    def __init__(self, ride_client: RideServiceClient | None = None, store: ConversationStore | None = None):
        self.ride_client = ride_client or RideServiceClient()
        self.store = store or ConversationStore()
        self.llm = get_llm()
        self.tools = build_ride_tools(self.ride_client)
        self.tool_map = {tool.name: tool for tool in self.tools}

    async def handle(self, message: str, session_id: str | None = None) -> tuple[str, AgentReply]:
        """Route a turn, retain compact history, then execute only the needed workflow."""
        session_id = session_id or str(uuid4())
        async with self.store.session(session_id) as snapshot:
            fields = self._extract_fields(message)
            self._merge_fields(snapshot.draft, fields)
            self._capture_follow_up_location(snapshot.draft, message, fields)
            self._record_turn(snapshot, "user", message)

            if self._is_social_message(message):
                reply = AgentReply(response=self._social_reply(message), action=AgentAction.HELP)
            elif self._should_execute_ride_workflow(message, snapshot, fields):
                reply = await self._fallback_turn(message, snapshot)
            else:
                reply = (
                    await self._tool_calling_turn(message, snapshot)
                    if self.llm
                    else AgentReply(
                        response="Mình hỗ trợ báo giá, đặt xe và theo dõi chuyến đi. Bạn muốn đi từ đâu đến đâu?",
                        action=AgentAction.HELP,
                    )
                )
            snapshot.last_action = reply.action
            self._record_turn(snapshot, "assistant", reply.response)
            return session_id, reply

    async def handle_quote_action(self, action: str, session_id: str, quote_id: str) -> tuple[str, AgentReply]:
        """Execute a quote-card action without another LLM round trip."""
        async with self.store.session(session_id) as snapshot:
            active_quote_id = snapshot.draft.latest_quote_id
            if not active_quote_id:
                return session_id, AgentReply(
                    response="Báo giá này không còn hiệu lực. Bạn hãy tạo báo giá mới nhé.",
                    action=AgentAction.CLARIFY,
                )
            if quote_id != active_quote_id:
                return session_id, AgentReply(
                    response="Báo giá không thuộc phiên hiện tại hoặc đã được thay thế. Bạn hãy tạo báo giá mới nhé.",
                    action=AgentAction.CLARIFY,
                )
            if action == "cancel_quote":
                snapshot.draft.latest_quote_id = None
                snapshot.last_action = AgentAction.CANCEL
                return session_id, AgentReply(
                    response="Đã hủy báo giá. Chưa có chuyến nào được đặt hoặc thanh toán.",
                    action=AgentAction.CANCEL,
                    data={"id": quote_id, "status": "cancelled"},
                )
            try:
                booking = await self.ride_client.create_booking(BookingCreateRequest(quote_id=active_quote_id))
            except RideApiError as exc:
                return session_id, AgentReply(response=f"Chưa thể xác nhận chuyến xe: {exc}", action=AgentAction.ERROR)
            snapshot.draft.latest_booking_id = booking.id
            snapshot.draft.latest_quote_id = None
            snapshot.last_action = AgentAction.BOOK
            return session_id, self._booking_reply(booking, AgentAction.BOOK)

    @staticmethod
    def _record_turn(snapshot: ConversationSnapshot, role: str, content: str) -> None:
        snapshot.history.append({"role": role, "content": content.strip()})
        snapshot.history = snapshot.history[-12:]

    @staticmethod
    def _is_social_message(message: str) -> bool:
        normalized = message.lower().strip()
        social = ("xin chào", "chào", "hello", "hi", "cảm ơn", "cam on", "thank", "tạm biệt", "bye")
        ride = ("xe", "đi ", "đón", "đến", "tới", " ra ", "giá", "đặt", "hủy", "chuyến", "tài xế")
        return any(token in normalized for token in social) and not any(token in normalized for token in ride)

    @staticmethod
    def _social_reply(message: str) -> str:
        normalized = message.lower()
        if any(token in normalized for token in ("cảm ơn", "cam on", "thank")):
            return "Không có gì! Khi cần đặt xe, bạn chỉ cần cho mình điểm đón và điểm đến nhé."
        if any(token in normalized for token in ("tạm biệt", "bye")):
            return "Chào bạn, hẹn gặp lại!"
        return "Xin chào! Mình là NaviGo, có thể hỗ trợ báo giá, đặt xe và theo dõi chuyến đi của bạn."

    @classmethod
    def _should_execute_ride_workflow(
        cls, message: str, snapshot: ConversationSnapshot, fields: dict[str, str]
    ) -> bool:
        normalized = message.lower()
        if fields:
            return True
        if snapshot.draft.latest_quote_id and any(
            token in normalized
            for token in ("xác nhận", "xac nhan", "đồng ý", "dong y", "ok", "oke", "đặt xe", "dat xe")
        ):
            return True
        if snapshot.draft.latest_booking_id and any(
            token in normalized
            for token in (
                "hủy",
                "huy",
                "cancel",
                "trạng thái",
                "trang thai",
                "tài xế",
                "tai xe",
                "cập nhật",
                "cap nhat",
            )
        ):
            return True
        ride_words = ("xe", "đi", "đón", "đến", "tới", "ra", "báo giá", "giá", "đặt", "hủy", "chuyến", "tài xế")
        if any(word in normalized for word in ride_words):
            return True
        return snapshot.last_action == AgentAction.CLARIFY and len(cls._missing_fields(snapshot.draft)) <= 1

    @classmethod
    def _capture_follow_up_location(cls, draft: RideDraft, message: str, fields: dict[str, str]) -> None:
        """Treat a bare location as the answer to the last single missing field."""
        if fields or len(cls._missing_fields(draft)) != 1:
            return
        normalized = message.lower().strip()
        ignored = (
            "xin chào",
            "chào",
            "cảm ơn",
            "cam on",
            "hủy",
            "cancel",
            "xác nhận",
            "xac nhan",
            "ok",
            "oke",
            "xe ",
            "đặt ",
        )
        if len(message.strip()) < 3 or any(token in normalized for token in ignored):
            return
        missing = cls._missing_fields(draft)[0]
        if missing == "điểm đón":
            draft.pickup_address = message.strip(" .,!?")
        else:
            draft.dropoff_address = message.strip(" .,!?")

    async def _tool_calling_turn(self, message: str, snapshot: ConversationSnapshot) -> AgentReply:
        context = json.dumps(snapshot.draft.model_dump(), ensure_ascii=False)
        history = json.dumps(snapshot.history[-8:], ensure_ascii=False)
        messages = [
            SystemMessage(content=f"{SYSTEM_PROMPT}\nCurrent draft: {context}\nRecent conversation: {history}"),
            HumanMessage(content=message),
        ]
        try:
            assistant = await self.llm.bind_tools(self.tools).ainvoke(messages)
        except Exception:
            return await self._fallback_turn(message, snapshot)

        calls = assistant.tool_calls or []
        if not calls:
            text = self._content(assistant)
            # Some models occasionally serialize a tool call into visible text.
            # Never expose that implementation detail to the rider.
            if "<function=" in text or "</function>" in text:
                text = ""
            text = text or self._clarification(snapshot.draft)
            return AgentReply(
                response=text, action=AgentAction.CLARIFY, missing_fields=self._missing_fields(snapshot.draft)
            )
        tool_messages: list[ToolMessage] = []
        action = AgentAction.HELP
        data: dict = {}
        for call in calls:
            tool = self.tool_map.get(call["name"])
            if tool is None:
                continue
            args = call.get("args", {})
            # Tool arguments are model-generated. Explicit user text was merged
            # into the draft before this turn and must never be overwritten.
            # A tool decision belongs to the LLM, but user-provided session
            # values are the authority for route parameters. This prevents
            # a model from inventing a location while selecting a tool.
            if call["name"] in ("create_live_ride_quote", "create_multi_vehicle_quotes"):
                missing = self._missing_fields(snapshot.draft)
                if missing:
                    return AgentReply(
                        response=self._clarification(snapshot.draft), action=AgentAction.CLARIFY, missing_fields=missing
                    )
                args = {
                    "pickup_address": snapshot.draft.pickup_address,
                    "dropoff_address": snapshot.draft.dropoff_address,
                    "vehicle_type": snapshot.draft.vehicle_type,
                    "promo_code": snapshot.draft.promo_code,
                }
            raw = await tool.ainvoke(args)
            tool_messages.append(ToolMessage(content=raw, tool_call_id=call["id"]))
            action = self._action_for_tool(call["name"])
            payload = self._json_payload(raw)
            if payload.get("ok"):
                data = payload.get("data", {})
                self._update_context_from_tool(snapshot.draft, data)

        if not tool_messages:
            return AgentReply(
                response="Mình chưa thể thực hiện yêu cầu đó. Bạn hãy cho mình điểm đón và điểm đến nhé.",
                action=AgentAction.CLARIFY,
            )
        try:
            final = await self.llm.ainvoke(messages + [assistant, *tool_messages])
            text = self._content(final)
        except Exception:
            text = ""
        return AgentReply(response=text or self._tool_summary(action, data), action=action, data=data)

    async def _create_quote_with_tool(self, draft: RideDraft) -> QuoteSummary:
        """Invoke the same bounded tool exposed to the LLM for a complete draft."""
        raw = await self.tool_map["create_live_ride_quote"].ainvoke(
            {
                "pickup_address": draft.pickup_address,
                "dropoff_address": draft.dropoff_address,
                "vehicle_type": draft.vehicle_type,
                "promo_code": draft.promo_code,
            }
        )
        payload = self._json_payload(raw)
        if not payload.get("ok"):
            raise RideApiError(str(payload.get("error", "Ride Service did not return a quote")))
        return QuoteSummary.model_validate(payload["data"])

    async def _fallback_turn(self, message: str, snapshot: ConversationSnapshot) -> AgentReply:
        """Keeps local/test operation useful if the provider is unavailable."""
        draft = snapshot.draft
        normalized = message.lower()
        booking_id = self._find_id(message, "ride") or draft.latest_booking_id
        try:
            if re.search(r"(?<!\w)(hủy|huy|cancel)(?!\w)", normalized):
                if not booking_id:
                    return AgentReply(
                        response="Bạn cho mình mã chuyến dạng ride_... để hủy nhé.",
                        action=AgentAction.CLARIFY,
                        missing_fields=["booking_id"],
                    )
                booking = await self.ride_client.cancel_booking(booking_id)
                draft.latest_booking_id = booking.id
                return self._booking_reply(booking, AgentAction.CANCEL)
            if any(
                value in normalized
                for value in ("trạng thái", "trang thai", "cập nhật", "cap nhat", "tài xế", "tai xe")
            ):
                if not booking_id:
                    return AgentReply(
                        response="Bạn cho mình mã chuyến dạng ride_... để kiểm tra nhé.",
                        action=AgentAction.CLARIFY,
                        missing_fields=["booking_id"],
                    )
                booking = await self.ride_client.get_booking(booking_id)
                draft.latest_booking_id = booking.id
                return self._booking_reply(booking, AgentAction.STATUS)
            if any(
                value in normalized
                for value in ("xác nhận", "xac nhan", "đồng ý", "dong y", "ok", "oke", "đặt xe", "dat xe")
            ):
                if not draft.latest_quote_id:
                    return AgentReply(
                        response="Mình cần báo giá trước. Bạn cho điểm đón và điểm đến nhé.",
                        action=AgentAction.CLARIFY,
                        missing_fields=["điểm đón", "điểm đến"],
                    )
                booking = await self.ride_client.create_booking(BookingCreateRequest(quote_id=draft.latest_quote_id))
                draft.latest_booking_id = booking.id
                return self._booking_reply(booking, AgentAction.BOOK)
            missing = self._missing_fields(draft)
            if missing:
                return AgentReply(
                    response=self._clarification(draft), action=AgentAction.CLARIFY, missing_fields=missing
                )
            quote = await self._create_quote_with_tool(draft)
            draft.latest_quote_id = quote.id
            return AgentReply(response=self._quote_summary(quote), action=AgentAction.QUOTE, data=quote.model_dump())
        except RideApiError:
            return AgentReply(
                response="Mình chưa thể lấy quãng đường thực tế lúc này. Bạn thử lại sau ít phút nhé.",
                action=AgentAction.ERROR,
            )

    @staticmethod
    def _extract_fields(message: str) -> dict[str, str]:
        fields: dict[str, str] = {}
        route = re.search(
            r"(?:từ|đón tại|đón ở)\s+(.+?)\s+(?:đi\s+)?(?:đến|tới|ra)\s+(.+?)(?:[,.!?]|$)",
            message,
            re.IGNORECASE,
        )
        if route:
            fields["pickup_address"] = RideConcierge._clean_location_phrase(route.group(1))
            fields["dropoff_address"] = RideConcierge._clean_location_phrase(route.group(2))
        elif match := re.search(r"(?:^|\s)(?:từ|đón tại|đón ở)\s+(.+?)(?:[,.!?]|$)", message, re.IGNORECASE):
            fields["pickup_address"] = RideConcierge._clean_location_phrase(match.group(1))
        elif match := re.search(r"(?:^|\s)(?:đến|tới|ra)\s+(.+?)(?:[,.!?]|$)", message, re.IGNORECASE):
            fields["dropoff_address"] = RideConcierge._clean_location_phrase(match.group(1))
        elif match := re.search(r"^(?:tôi\s+)?(?:muốn\s+)?đi\s+(.+?)(?:[,.!?]|$)", message.strip(), re.IGNORECASE):
            fields["dropoff_address"] = RideConcierge._clean_location_phrase(match.group(1))

        normalized = message.lower()
        if any(value in normalized for value in ("xe máy", "xe may", "bike")):
            fields["vehicle_type"] = "BIKE"
        elif any(value in normalized for value in ("7 chỗ", "7 cho", "car_7")):
            fields["vehicle_type"] = "CAR_7"
        elif any(value in normalized for value in ("4 chỗ", "4 cho", "car_4")):
            fields["vehicle_type"] = "CAR_4"
        if "save5000" in normalized:
            fields["promo_code"] = "SAVE5000"
        if quote_id := RideConcierge._find_id(message, "quote"):
            fields["latest_quote_id"] = quote_id
        if booking_id := RideConcierge._find_id(message, "ride"):
            fields["latest_booking_id"] = booking_id
        return {name: value for name, value in fields.items() if value}

    @staticmethod
    def _clean_location_phrase(value: str) -> str:
        return re.sub(r"\s+(?:đi|bằng)\s*$", "", value.strip(" .,!?"), flags=re.IGNORECASE)

    @staticmethod
    def _find_id(message: str, prefix: str) -> str | None:
        match = re.search(rf"{prefix}_[a-zA-Z0-9]+", message)
        return match.group(0) if match else None

    @staticmethod
    def _merge_fields(draft: RideDraft, fields: dict) -> None:
        for name in (
            "pickup_address",
            "dropoff_address",
            "vehicle_type",
            "promo_code",
            "latest_quote_id",
            "latest_booking_id",
        ):
            if fields.get(name):
                setattr(draft, name, fields[name])

    @staticmethod
    def _update_context_from_tool(draft: RideDraft, data: dict) -> None:
        if str(data.get("id", "")).startswith("quote_"):
            draft.latest_quote_id = data["id"]
        if str(data.get("id", "")).startswith("ride_"):
            draft.latest_booking_id = data["id"]

    @staticmethod
    def _missing_fields(draft: RideDraft) -> list[str]:
        placeholders = {"đây", "day", "ở đây", "o day", "chỗ này", "cho nay", "here"}
        return [
            name
            for name, value in (("điểm đón", draft.pickup_address), ("điểm đến", draft.dropoff_address))
            if not value or value.strip().lower() in placeholders
        ]

    @classmethod
    def _clarification(cls, draft: RideDraft) -> str:
        missing = cls._missing_fields(draft)
        placeholders = {"đây", "day", "ở đây", "o day", "chỗ này", "cho nay", "here"}
        if "điểm đón" in missing and draft.pickup_address and draft.pickup_address.strip().lower() in placeholders:
            return "Mình chưa biết vị trí ‘đây’. Bạn cho mình địa chỉ hoặc tên địa điểm đón cụ thể nhé."
        return (
            f"Để báo giá xe, bạn cho mình {' và '.join(missing)} nhé."
            if missing
            else "Bạn muốn báo giá hay xác nhận đặt xe?"
        )

    @staticmethod
    def _content(message) -> str:
        return message.content.strip() if isinstance(message.content, str) else str(message.content).strip()

    @staticmethod
    def _json_payload(raw: str) -> dict:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}

    @staticmethod
    def _action_for_tool(name: str) -> AgentAction:
        return {
            "create_live_ride_quote": AgentAction.QUOTE,
            "create_multi_vehicle_quotes": AgentAction.MULTI_QUOTE,
            "create_ride_booking": AgentAction.BOOK,
            "get_ride_booking_status": AgentAction.STATUS,
            "cancel_ride_booking": AgentAction.CANCEL,
            "complete_ride_booking": AgentAction.COMPLETE,
            "finalize_ride_fare": AgentAction.FINALIZE,
            "get_ride_fare_breakdown": AgentAction.FARE_BREAKDOWN,
            "get_audit_logs": AgentAction.AUDIT,
        }.get(name, AgentAction.HELP)

    @staticmethod
    def _quote_summary(quote: QuoteSummary) -> str:
        return f"Báo giá {quote.amount:,} VND cho xe {quote.vehicle_type}, khoảng {quote.distance_km} km / {quote.duration_minutes} phút. Bạn xác nhận đặt xe nhé?"

    @staticmethod
    def _booking_reply(booking: BookingSummary, action: AgentAction) -> AgentReply:
        message = f"Chuyến {booking.id} hiện có trạng thái {booking.status}."
        if booking.driver_eta_seconds:
            message += f" Tài xế dự kiến đến trong {booking.driver_eta_seconds // 60} phút."
        if booking.last_error:
            message += f" Chi tiết: {booking.last_error}."
        return AgentReply(response=message, action=action, data=booking.model_dump())

    @staticmethod
    def _tool_summary(action: AgentAction, data: dict) -> str:
        if action == AgentAction.QUOTE:
            return f"Đã tạo báo giá {data.get('amount', '')} VND. Bạn có muốn xác nhận đặt xe không?"
        if action == AgentAction.MULTI_QUOTE:
            return "Đây là các lựa chọn phương tiện dành cho bạn. Vui lòng chọn loại xe mong muốn."
        if action == AgentAction.FARE_BREAKDOWN:
            return "Đây là chi tiết phân tách giá của bạn."
        if action == AgentAction.AUDIT:
            return "Đây là lịch sử giao dịch của bạn."
        if data.get("id"):
            return f"Đã cập nhật chuyến {data['id']} với trạng thái {data.get('status', '')}."
        return "Yêu cầu đã được xử lý."


ride_concierge = RideConcierge()
