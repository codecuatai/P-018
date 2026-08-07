from langgraph.graph import END, StateGraph

from src.agents.nodes.restaurant_node import classify_and_extract, compose_restaurant_response
from src.agents.state import AgentState


def build_restaurant_graph():
    """Compile the Restaurant capability without replacing the Food graph."""
    graph = StateGraph(AgentState)
    graph.add_node("classify_and_extract", classify_and_extract)
    graph.add_node("compose_response", compose_restaurant_response)
    graph.set_entry_point("classify_and_extract")
    graph.add_edge("classify_and_extract", "compose_response")
    graph.add_edge("compose_response", END)
    return graph.compile()


agent = build_restaurant_graph()
