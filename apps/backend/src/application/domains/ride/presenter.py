"""User-facing presentation for ride workflow results."""

from __future__ import annotations

from src.application.domains.ride.contracts import BookingSummary, QuoteSummary
from src.application.domains.ride.state import RideDraft
from src.contracts.chat import AgentAction, AgentReply
from src.infrastructure.clients.ride_client import RideApiError


class RidePresenter:
    @staticmethod
    def social_reply(message: str) -> str:
        normalized = message.lower()
        if any(token in normalized for token in ("cảm ơn", "cam on", "thank")):
            return "Không có gì! Khi cần đặt xe, bạn chỉ cần cho mình điểm đón và điểm đến nhé."
        if any(token in normalized for token in ("tạm biệt", "bye")):
            return "Chào bạn, hẹn gặp lại!"
        return "Xin chào! Mình là NaviGo, có thể hỗ trợ báo giá, đặt xe và theo dõi chuyến đi của bạn."

    @staticmethod
    def clarification(draft: RideDraft, missing_fields: list[str]) -> str:
        placeholders = {"đây", "day", "ở đây", "o day", "chỗ này", "cho nay", "here"}
        if "điểm đón" in missing_fields and draft.pickup_address and draft.pickup_address.strip().lower() in placeholders:
            return "Mình chưa biết vị trí ‘đây’. Bạn cho mình địa chỉ hoặc tên địa điểm đón cụ thể nhé."
        return (
            f"Để báo giá xe, bạn cho mình {' và '.join(missing_fields)} nhé."
            if missing_fields
            else "Bạn muốn báo giá hay xác nhận đặt xe?"
        )

    @staticmethod
    def quote_summary(quote: QuoteSummary) -> str:
        return f"Báo giá {quote.amount:,} VND cho xe {quote.vehicle_type}, khoảng {quote.distance_km} km / {quote.duration_minutes} phút. Bạn xác nhận đặt xe nhé?"

    @staticmethod
    def booking_reply(booking: BookingSummary, action: AgentAction) -> AgentReply:
        message = f"Chuyến {booking.id} hiện có trạng thái {booking.status}."
        if booking.driver_eta_seconds:
            message += f" Tài xế dự kiến đến trong {booking.driver_eta_seconds // 60} phút."
        if booking.last_error:
            message += f" Chi tiết: {booking.last_error}."
        return AgentReply(response=message, action=action, data=booking.model_dump())

    @staticmethod
    def error_reply(exc: RideApiError, operation: str) -> AgentReply:
        status = f"HTTP {exc.status_code}" if exc.status_code is not None else "không có mã HTTP"
        diagnostic = f"Mã lỗi: {exc.code} | Dịch vụ: Ride | Trạng thái: {status} | Số lần thử: {exc.attempts}"
        return AgentReply(
            response=f"Chưa thể {operation}. {exc}\n{diagnostic}",
            action=AgentAction.ERROR,
            data={"error": exc.to_payload()},
        )

