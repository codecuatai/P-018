
from src.models.schemas import ToolRequest

READ_TOOLS = {
    "restaurant.search",
    "restaurant.get",
    "restaurant.check_availability",
    "restaurant.get_reservation",
    "restaurant.list_reservations",
}
WRITE_TOOLS = {
    "restaurant.create_hold",
    "restaurant.create_reservation",
    "restaurant.cancel_reservation",
}


def validate_tool_request(request: ToolRequest) -> ToolRequest:
    """Apply code-owned policy after model/parser output."""
    if request.tool_name in READ_TOOLS and request.risk_level != "READ":
        raise ValueError("READ tools must use READ risk level")
    if request.tool_name in WRITE_TOOLS and request.risk_level not in {"REVERSIBLE_WRITE", "FINANCIAL_OR_FINAL"}:
        raise ValueError("Write tools require a write risk level")
    if request.tool_name not in READ_TOOLS | WRITE_TOOLS:
        raise ValueError("Tool is not enabled for this agent slice")
    return request
