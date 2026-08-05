from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000, description="Tin nhắn từ user")
    session_id: str = Field(default="default_session", description="ID phiên chat để lưu lịch sử")


class ChatResponse(BaseModel):
    response: str = Field(..., description="Phản hồi từ agent")
    is_interrupted: bool = Field(default=False, description="Đánh dấu Graph đang bị tạm dừng chờ confirm")
    
    # Contract outputs
    medical_status: str | None = None
    destination_address: str | None = None
    appointment_time: str | None = None
