from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages

class AgentState(TypedDict, total=False):
    """State schema cho LangGraph agent hỗ trợ lưu trữ history."""
    messages: Annotated[list, add_messages]
    query: str
    response: str
    
    # Integration Contract Outputs
    medical_status: str
    destination_address: str
    appointment_time: str
