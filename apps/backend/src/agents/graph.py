from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode
from langgraph.checkpoint.memory import MemorySaver

from src.agents.nodes.example_node import chatbot_node
from src.agents.state import AgentState
from src.agents.tools.medical_tools import analyze_symptoms, get_available_slots, hold_slot, confirm_booking

def route_tools(state: AgentState):
    """Điều hướng đến Tools nếu LLM request tool call."""
    messages = state.get("messages", [])
    last_message = messages[-1]
    if last_message.tool_calls:
        # Kiểm tra xem có phải là gọi tool confirm_booking không
        for tc in last_message.tool_calls:
            if tc["name"] == "confirm_booking":
                return "confirm_node"
        return "tools"
    return END

def process_booked_status(state: AgentState):
    """Node xử lý logic sau khi đã confirm_booking thành công để trả về Integration Contract."""
    messages = state.get("messages", [])
    last_message = messages[-1]
    # Lấy thông tin từ database hoặc tool message
    # Tạm thời mock dữ liệu trả về theo Contract
    return {
        "medical_status": "SUCCESS",
        "destination_address": "Bệnh viện Đa Khoa X",
        "appointment_time": "2026-08-06T09:00:00"
    }

def build_graph() -> StateGraph:
    graph = StateGraph(AgentState)

    # Khai báo các Node
    graph.add_node("chatbot", chatbot_node)
    
    # Các tools thông thường
    standard_tools = [analyze_symptoms, get_available_slots, hold_slot]
    graph.add_node("tools", ToolNode(tools=standard_tools))
    
    # Tool confirm_booking (Node đặc biệt để interrupt)
    confirm_node = ToolNode(tools=[confirm_booking])
    graph.add_node("confirm_node", confirm_node)
    
    # Node xử lý output sau khi confirm
    graph.add_node("finalize_booking", process_booked_status)

    # Khai báo Edges
    graph.set_entry_point("chatbot")
    graph.add_conditional_edges("chatbot", route_tools, {
        "tools": "tools", 
        "confirm_node": "confirm_node",
        END: END
    })
    graph.add_edge("tools", "chatbot")
    graph.add_edge("confirm_node", "finalize_booking")
    graph.add_edge("finalize_booking", "chatbot")

    # Thêm Memory để ghi nhớ ngữ cảnh hội thoại
    memory = MemorySaver()
    
    # Compile graph
    return graph.compile(checkpointer=memory)

agent = build_graph()
