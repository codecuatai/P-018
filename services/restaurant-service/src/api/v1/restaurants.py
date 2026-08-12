from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from src.api.auth import require_internal_auth
from src.models.schemas import AvailabilityCheckRequest

router = APIRouter(prefix="/restaurants", tags=["Restaurants"])


def envelope(data, request: Request):
    return {"data": data, "meta": {"request_id": request.headers.get("X-Correlation-Id"), "timestamp": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()}}


@router.get("")
def search_restaurants(request: Request, _actor=Depends(require_internal_auth), location: str | None = Query(None), cuisine_type: str | None = Query(None), budget_range: str | None = Query(None), query: str | None = Query(None), limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0)):
    service = request.app.state.restaurant_service
    items = service.search_restaurants(location, cuisine_type, budget_range, query, limit, offset)
    return envelope({"items": items, "total": len(items), "limit": limit, "offset": offset}, request)


@router.get("/{restaurant_id}")
def get_restaurant(restaurant_id: str, request: Request, _actor=Depends(require_internal_auth)):
    restaurant = request.app.state.restaurant_service.get_restaurant(restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant not found")
    return envelope(restaurant, request)


@router.post("/{restaurant_id}/availability")
def check_availability(restaurant_id: str, body: AvailabilityCheckRequest, request: Request, _actor=Depends(require_internal_auth)):
    try:
        result = request.app.state.restaurant_service.check_availability(restaurant_id, body.party_size, body.start_at, body.duration_minutes, body.seating_type)
        return envelope(result, request)
    except ValueError as exc:
        error_code = str(exc)
        if error_code == "RESTAURANT_NOT_FOUND":
            raise HTTPException(status_code=404, detail="Restaurant not found") from exc
        if error_code in {"PAST_START", "CAPACITY_UNAVAILABLE"}:
            raise HTTPException(status_code=422, detail=error_code) from exc
        raise HTTPException(status_code=422, detail="Invalid availability request") from exc
