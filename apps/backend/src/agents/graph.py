from langgraph.graph import END, StateGraph

from src.agents.conversation import RideConcierge, ride_concierge
from src.agents.state import AgentState


def build_graph(concierge: RideConcierge | None = None):
    """Build a small graph around the bounded ride-concierge brain."""
    concierge = concierge or ride_concierge

    async def run_concierge(state: AgentState) -> dict:
        session_id, reply = await concierge.handle(state.get("query", ""), state.get("session_id"))
        return {
            "session_id": session_id,
            "response": reply.response,
            "analysis": f"action={reply.action.value}",
            "action": reply.action.value,
            "missing_fields": reply.missing_fields,
            "data": reply.data,
        }

    graph = StateGraph(AgentState)
    graph.add_node("concierge", run_concierge)
    graph.set_entry_point("concierge")
    graph.add_edge("concierge", END)
    return graph.compile()


agent = build_graph()
