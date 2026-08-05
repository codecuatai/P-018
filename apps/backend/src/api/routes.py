import asyncio
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from src.agents.graph import agent
from src.models.schemas import ChatRequest, ChatResponse

router = APIRouter()

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Chat với AI agent và xử lý interrupt."""
    try:
        config = {"configurable": {"thread_id": request.session_id}}
        
        # Gửi tin nhắn bình thường
        result = await agent.ainvoke({"query": request.message}, config)
        
        print("DEBUG RESULT:", result)
        
        return ChatResponse(
            response=result.get("response", ""),
            is_interrupted=False,
            medical_status=result.get("medical_status"),
            destination_address=result.get("destination_address"),
            appointment_time=result.get("appointment_time")
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def agent_status():
    """Kiểm tra trạng thái agent."""
    return {"status": "ready", "agent": "Medical Agent v1.0"}

from pydantic import BaseModel
from src.database import SessionLocal
from src.models.medical import Appointment

class WebhookRequest(BaseModel):
    appointment_id: int

@router.post("/payment/webhook")
async def payment_webhook(request: WebhookRequest):
    """Giả lập Webhook nhận kết quả thanh toán từ cổng (MoMo/VNPay)."""
    db = SessionLocal()
    try:
        app = db.query(Appointment).filter(Appointment.id == request.appointment_id).first()
        if app:
            app.is_paid = True
            db.commit()
            return {"status": "success", "message": f"Appointment {app.id} marked as paid."}
        raise HTTPException(status_code=404, detail="Appointment not found")
    finally:
        db.close()


# Quản lý kết nối WebSocket
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_notification(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

@router.websocket("/ws/notifications")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket giả lập bác sĩ trả kết quả."""
    await manager.connect(websocket)
    try:
        # Ngay khi kết nối, giả lập delay 5s rồi đẩy thông báo
        await asyncio.sleep(5)
        await manager.send_notification('{"type": "push_notification", "message": "Bác sĩ Nguyễn Văn An đã cập nhật kết quả xét nghiệm máu của bạn. Nhấn vào để xem chi tiết."}')
        
        while True:
            # Giữ connection mở
            data = await websocket.receive_text()
            # Có thể xử lý tin nhắn từ client nếu cần
    except WebSocketDisconnect:
        manager.disconnect(websocket)
