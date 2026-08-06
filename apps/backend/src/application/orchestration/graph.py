"""LangGraph nodes for one Concierge workflow with bounded domain adapters."""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from src.application.domains.contracts import Domain
from src.application.orchestration.concierge import ConciergeRoute, ConciergeWorkflow, concierge
from src.application.orchestration.graph_state import ConciergeState
from src.application.orchestration.scope_guard import ScopeKind


def build_graph(concierge_workflow: ConciergeWorkflow | None = None):
    """Build one graph; routing is deterministic and domains never hand off LLM state."""
    runtime = concierge_workflow or concierge

    async def run_scope_guard(state: ConciergeState) -> dict:
        scope = await runtime.scope_guard.assess(state.get("query", ""))
        return {"scope": scope.value, "trace": [*state.get("trace", []), f"scope:{scope.value}"]}

    def after_scope(state: ConciergeState) -> str:
        return "route" if state.get("scope") == ScopeKind.SERVICE.value else "out_of_scope"

    async def run_router(state: ConciergeState) -> dict:
        session_id = runtime.session_id(state.get("session_id"))
        route = runtime.route(
            state.get("query", ""), session_id, ScopeKind(state.get("scope", ScopeKind.OUTSIDE.value))
        )
        payload = {"session_id": session_id, "route": route.value, "trace": [*state.get("trace", []), f"route:{route.value}"]}
        if route in {ConciergeRoute.RIDE, ConciergeRoute.FOOD, ConciergeRoute.HOTEL, ConciergeRoute.CLINIC}:
            payload["domain"] = route.value
        return payload

    def after_router(state: ConciergeState) -> str:
        return state.get("route", ConciergeRoute.SERVICE_CONVERSATION.value)

    def domain_node(domain: Domain):
        async def run_domain(state: ConciergeState) -> dict:
            session_id, reply = await runtime.run_domain(domain, state.get("query", ""), state["session_id"])
            return _result(state, reply, session_id, ConciergeRoute(domain.value), domain.value)

        return run_domain

    async def run_service_conversation(state: ConciergeState) -> dict:
        reply = await runtime.run_conversation(state.get("query", ""))
        return _result(state, reply, state["session_id"], ConciergeRoute.SERVICE_CONVERSATION)

    async def run_out_of_scope(state: ConciergeState) -> dict:
        scope = ScopeKind(state.get("scope", ScopeKind.OUTSIDE.value))
        reply = runtime.out_of_scope_reply(scope)
        session_id = runtime.session_id(state.get("session_id"))
        return _result(state, reply, session_id, ConciergeRoute.OUT_OF_SCOPE)

    graph = StateGraph(ConciergeState)
    graph.add_node("scope_guard", run_scope_guard)
    graph.add_node("router", run_router)
    graph.add_node("ride", domain_node(Domain.RIDE))
    graph.add_node("food", domain_node(Domain.FOOD))
    graph.add_node("hotel", domain_node(Domain.HOTEL))
    graph.add_node("clinic", domain_node(Domain.CLINIC))
    graph.add_node("service_conversation", run_service_conversation)
    graph.add_node("out_of_scope", run_out_of_scope)
    graph.set_entry_point("scope_guard")
    graph.add_conditional_edges("scope_guard", after_scope, {"route": "router", "out_of_scope": "out_of_scope"})
    graph.add_conditional_edges(
        "router",
        after_router,
        {
            "ride": "ride",
            "food": "food",
            "hotel": "hotel",
            "clinic": "clinic",
            "service_conversation": "service_conversation",
            "out_of_scope": "out_of_scope",
        },
    )
    for node in ("ride", "food", "hotel", "clinic", "service_conversation", "out_of_scope"):
        graph.add_edge(node, END)
    return graph.compile()


def _result(state: ConciergeState, reply, session_id: str, route: ConciergeRoute, domain: str | None = None) -> dict:
    data = {
        **reply.data,
        "route": route.value,
        "workflow": domain or ("service_conversation" if route is ConciergeRoute.SERVICE_CONVERSATION else "concierge"),
        "scope": state.get("scope", ScopeKind.SERVICE.value),
        "trace": [*state.get("trace", []), f"workflow:{domain or route.value}"],
    }
    if domain:
        data["domain"] = domain
    return {
        "session_id": session_id,
        "route": route.value,
        "response": reply.response,
        "analysis": f"route={route.value}; action={reply.action.value}",
        "action": reply.action.value,
        "missing_fields": reply.missing_fields,
        "data": data,
        "trace": data["trace"],
    }


concierge_graph = build_graph()


