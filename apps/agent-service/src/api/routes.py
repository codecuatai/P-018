import asyncio
import logging
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from src.agents.graph import agent
from src.models.schemas import ChatRequest, ChatResponse

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Chat với AI agent và xử lý interrupt."""
    try:
        config = {"configurable": {"thread_id": request.session_id}}
        
        # Gửi tin nhắn bình thường
        result = await agent.ainvoke({"query": request.message}, config)
        
        return ChatResponse(
            response=result.get("response", ""),
            is_interrupted=False,
            medical_status=result.get("medical_status"),
            destination_address=result.get("destination_address"),
            appointment_time=result.get("appointment_time")
        )
    except Exception as e:
        logger.exception("Agent chat execution failed")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def agent_status():
    """Kiểm tra trạng thái agent."""
    return {"status": "ready", "agent": "Medical Agent v1.0"}


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
