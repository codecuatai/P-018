from src.models.schemas import ToolRequest

READ_TOOLS = {
    "healthcare.search_facilities",
    "healthcare.get_facility",
    "healthcare.list_departments",
    "healthcare.list_doctors",
    "healthcare.list_slots",
    "healthcare.get_appointment",
    "healthcare.list_appointments",
}
REVERSIBLE_TOOLS = {"healthcare.hold_slot", "healthcare.cancel_appointment"}
FINAL_TOOLS = {"healthcare.confirm_appointment"}


def validate_tool_request(request: ToolRequest) -> ToolRequest:
    if request.tool_name in READ_TOOLS and request.risk_level != "READ":
        raise ValueError("Healthcare read tools must use READ risk level")
    if request.tool_name in REVERSIBLE_TOOLS and request.risk_level != "REVERSIBLE_WRITE":
        raise ValueError("Healthcare reversible tools must use REVERSIBLE_WRITE risk level")
    if request.tool_name in FINAL_TOOLS and request.risk_level != "FINANCIAL_OR_FINAL":
        raise ValueError("Healthcare final tools must use FINANCIAL_OR_FINAL risk level")
    if request.tool_name not in READ_TOOLS | REVERSIBLE_TOOLS | FINAL_TOOLS:
        raise ValueError("Healthcare tool is not enabled for this agent slice")
    return request
